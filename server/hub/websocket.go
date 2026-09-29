package hub

// A tiny, dependency-free WebSocket (RFC 6455) server — just enough for Flux.
// Flux ships as a single self-contained static binary that builds offline, so
// we own this small piece rather than pulling in a module. It reads masked
// text/binary frames, writes unmasked ones, and answers ping/close. It is not
// a general-purpose library (no extensions, capped message size).

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	TextMessage   = 0x1
	BinaryMessage = 0x2
)

const (
	opContinuation = 0x0
	opText         = 0x1
	opBinary       = 0x2
	opClose        = 0x8
	opPing         = 0x9
	opPong         = 0xA
)

// maxMessageSize caps a single (possibly fragmented) message. Data-plane
// chunks are bounded well under this; it exists to refuse abusive frames.
const maxMessageSize = 24 << 20

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// ErrClosed is returned by ReadMessage after the peer sent a close frame.
var ErrClosed = errors.New("ws: connection closed by peer")

// Conn is a single upgraded WebSocket connection.
type Conn struct {
	conn net.Conn
	br   *bufio.Reader
	wmu  sync.Mutex
}

// Upgrade performs the handshake and hijacks the TCP connection.
func Upgrade(w http.ResponseWriter, r *http.Request) (*Conn, error) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return nil, errors.New("ws: not a websocket upgrade")
	}
	if !headerHasToken(r.Header.Get("Connection"), "upgrade") {
		return nil, errors.New("ws: missing Connection: upgrade")
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		return nil, errors.New("ws: missing Sec-WebSocket-Key")
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		return nil, errors.New("ws: hijacking unsupported")
	}
	netConn, brw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}
	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + acceptKey(key) + "\r\n\r\n"
	if _, err := brw.WriteString(resp); err != nil {
		netConn.Close()
		return nil, err
	}
	if err := brw.Flush(); err != nil {
		netConn.Close()
		return nil, err
	}
	return &Conn{conn: netConn, br: brw.Reader}, nil
}

// ReadMessage reads one complete application message, answering pings and
// reassembling fragments. Returns TextMessage or BinaryMessage.
func (c *Conn) ReadMessage() (msgType int, data []byte, err error) {
	msgType = -1
	for {
		fin, opcode, payload, err := c.readFrame()
		if err != nil {
			return 0, nil, err
		}
		switch opcode {
		case opText, opBinary:
			msgType = opcode
			data = append(data, payload...)
		case opContinuation:
			data = append(data, payload...)
		case opPing:
			_ = c.writeFrame(opPong, payload)
			continue
		case opPong:
			continue
		case opClose:
			_ = c.writeFrame(opClose, nil)
			c.conn.Close()
			return 0, nil, ErrClosed
		default:
			return 0, nil, errors.New("ws: unknown opcode")
		}
		if len(data) > maxMessageSize {
			return 0, nil, errors.New("ws: message too large")
		}
		if fin {
			return msgType, data, nil
		}
	}
}

func (c *Conn) WriteMessage(msgType int, data []byte) error { return c.writeFrame(msgType, data) }
func (c *Conn) Ping() error                                 { return c.writeFrame(opPing, nil) }

func (c *Conn) Close() error {
	_ = c.writeFrame(opClose, nil)
	return c.conn.Close()
}

func (c *Conn) SetReadDeadline(t time.Time) error { return c.conn.SetReadDeadline(t) }

func (c *Conn) readFrame() (fin bool, opcode int, payload []byte, err error) {
	var h [2]byte
	if _, err = io.ReadFull(c.br, h[:]); err != nil {
		return
	}
	fin = h[0]&0x80 != 0
	opcode = int(h[0] & 0x0f)
	masked := h[1]&0x80 != 0
	n := int64(h[1] & 0x7f)
	switch n {
	case 126:
		var e [2]byte
		if _, err = io.ReadFull(c.br, e[:]); err != nil {
			return
		}
		n = int64(binary.BigEndian.Uint16(e[:]))
	case 127:
		var e [8]byte
		if _, err = io.ReadFull(c.br, e[:]); err != nil {
			return
		}
		n = int64(binary.BigEndian.Uint64(e[:]))
	}
	if n < 0 || n > maxMessageSize {
		err = errors.New("ws: frame too large")
		return
	}
	var mask [4]byte
	if masked {
		if _, err = io.ReadFull(c.br, mask[:]); err != nil {
			return
		}
	}
	payload = make([]byte, n)
	if _, err = io.ReadFull(c.br, payload); err != nil {
		return
	}
	if masked {
		for i := range payload {
			payload[i] ^= mask[i%4]
		}
	}
	return fin, opcode, payload, nil
}

func (c *Conn) writeFrame(opcode int, payload []byte) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()

	n := len(payload)
	buf := make([]byte, 0, 10+n)
	buf = append(buf, byte(0x80|opcode))
	switch {
	case n < 126:
		buf = append(buf, byte(n))
	case n < 1<<16:
		buf = append(buf, 126, byte(n>>8), byte(n))
	default:
		var e [8]byte
		binary.BigEndian.PutUint64(e[:], uint64(n))
		buf = append(buf, 127)
		buf = append(buf, e[:]...)
	}
	buf = append(buf, payload...)
	_, err := c.conn.Write(buf)
	return err
}

func acceptKey(key string) string {
	h := sha1.New()
	h.Write([]byte(key + wsGUID))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func headerHasToken(header, token string) bool {
	for _, part := range strings.Split(header, ",") {
		if strings.EqualFold(strings.TrimSpace(part), token) {
			return true
		}
	}
	return false
}
