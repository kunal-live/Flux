package hub

// A tiny, dependency-free WebSocket (RFC 6455) server — just enough for Flux.
// Flux ships as a single self-contained static binary that builds offline, so
// we own this small piece rather than pulling in a module. It reads masked
// text/binary frames, writes unmasked ones, answers ping/close, enforces
// protocol invariants (UTF-8, RSV bits, unfragmented control frames, opcode
// validity), and handles fragmentation.

import (
	"bufio"
	"crypto/rand"
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
	"unicode/utf8"
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
	conn        net.Conn
	br          *bufio.Reader
	wmu         sync.Mutex
	enforceMask bool
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
	return &Conn{conn: netConn, br: brw.Reader, enforceMask: true}, nil
}

// SetEnforceMask configures whether incoming client frames must be masked.
// Enabled by default on upgraded connections per RFC 6455 §5.1.
func (c *Conn) SetEnforceMask(enforce bool) {
	c.enforceMask = enforce
}

// ReadMessage reads one complete application message, answering pings,
// reassembling fragments, and validating protocol invariants per RFC 6455.
// Returns TextMessage or BinaryMessage.
func (c *Conn) ReadMessage() (msgType int, data []byte, err error) {
	var inFrag bool
	var fragType int

	for {
		fin, opcode, payload, err := c.readFrame()
		if err != nil {
			return 0, nil, err
		}

		// Control frames may be injected between message fragments.
		if opcode >= opClose {
			if !fin {
				_ = c.WriteClose(1002, "fragmented control frame")
				c.conn.Close()
				return 0, nil, errors.New("ws: fragmented control frame")
			}
			if len(payload) > 125 {
				_ = c.WriteClose(1002, "control frame too large")
				c.conn.Close()
				return 0, nil, errors.New("ws: control frame too large")
			}

			switch opcode {
			case opPing:
				_ = c.writeFrame(opPong, payload)
				continue
			case opPong:
				continue
			case opClose:
				closeCode := uint16(1000)
				if len(payload) == 1 {
					_ = c.WriteClose(1002, "invalid close payload length")
					c.conn.Close()
					return 0, nil, errors.New("ws: invalid close length")
				}
				if len(payload) >= 2 {
					closeCode = binary.BigEndian.Uint16(payload[:2])
					if !isValidCloseCode(closeCode) || !utf8.Valid(payload[2:]) {
						_ = c.WriteClose(1002, "invalid close code or reason")
						c.conn.Close()
						return 0, nil, errors.New("ws: invalid close frame")
					}
				}
				_ = c.WriteClose(closeCode, "")
				c.conn.Close()
				return 0, nil, ErrClosed
			default:
				_ = c.WriteClose(1002, "unknown control opcode")
				c.conn.Close()
				return 0, nil, errors.New("ws: unknown control opcode")
			}
		}

		// Data and continuation frames
		switch opcode {
		case opContinuation:
			if !inFrag {
				_ = c.WriteClose(1002, "unexpected continuation frame")
				c.conn.Close()
				return 0, nil, errors.New("ws: unexpected continuation")
			}
			data = append(data, payload...)
			if len(data) > maxMessageSize {
				_ = c.WriteClose(1009, "message too large")
				c.conn.Close()
				return 0, nil, errors.New("ws: message too large")
			}
			if fin {
				inFrag = false
				if fragType == opText && !utf8.Valid(data) {
					_ = c.WriteClose(1007, "invalid utf-8")
					c.conn.Close()
					return 0, nil, errors.New("ws: invalid utf-8 in fragmented text")
				}
				return fragType, data, nil
			}

		case opText, opBinary:
			if inFrag {
				_ = c.WriteClose(1002, "unfinished fragmented message")
				c.conn.Close()
				return 0, nil, errors.New("ws: unfinished fragmented message")
			}
			if !fin {
				inFrag = true
				fragType = opcode
				data = append(data[:0], payload...)
			} else {
				if opcode == opText && !utf8.Valid(payload) {
					_ = c.WriteClose(1007, "invalid utf-8")
					c.conn.Close()
					return 0, nil, errors.New("ws: invalid utf-8")
				}
				return opcode, payload, nil
			}

		default:
			_ = c.WriteClose(1002, "unknown data opcode")
			c.conn.Close()
			return 0, nil, errors.New("ws: unknown opcode")
		}
	}
}

func (c *Conn) WriteMessage(msgType int, data []byte) error { return c.writeFrame(msgType, data) }
func (c *Conn) Ping() error                                 { return c.writeFrame(opPing, nil) }

func (c *Conn) WriteClose(code uint16, reason string) error {
	var payload []byte
	if code != 0 {
		payload = make([]byte, 2+len(reason))
		binary.BigEndian.PutUint16(payload[:2], code)
		copy(payload[2:], reason)
	}
	return c.writeFrame(opClose, payload)
}

func (c *Conn) Close() error {
	_ = c.WriteClose(1000, "normal closure")
	return c.conn.Close()
}

func (c *Conn) SetReadDeadline(t time.Time) error { return c.conn.SetReadDeadline(t) }

func (c *Conn) readFrame() (fin bool, opcode int, payload []byte, err error) {
	var h [2]byte
	if _, err = io.ReadFull(c.br, h[:]); err != nil {
		return
	}
	fin = h[0]&0x80 != 0
	rsv := h[0] & 0x70
	if rsv != 0 {
		_ = c.WriteClose(1002, "reserved bits must be zero")
		c.conn.Close()
		err = errors.New("ws: rsv bits set")
		return
	}

	opcode = int(h[0] & 0x0f)
	masked := h[1]&0x80 != 0
	if c.enforceMask && !masked {
		_ = c.WriteClose(1002, "client frames must be masked")
		c.conn.Close()
		err = errors.New("ws: unmasked client frame")
		return
	}

	n := int64(h[1] & 0x7f)
	if opcode >= opClose && n > 125 {
		_ = c.WriteClose(1002, "control frame length > 125")
		c.conn.Close()
		err = errors.New("ws: control frame payload > 125")
		return
	}

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
		_ = c.WriteClose(1009, "frame too large")
		c.conn.Close()
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

func isValidCloseCode(code uint16) bool {
	switch code {
	case 1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011:
		return true
	default:
		return code >= 3000 && code <= 4999
	}
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

// WriteClientFrame is a helper for testing that writes a properly RFC 6455-masked
// client frame to a connection or writer.
func WriteClientFrame(w io.Writer, fin bool, opcode int, payload []byte) error {
	b0 := byte(opcode & 0x0f)
	if fin {
		b0 |= 0x80
	}
	n := len(payload)
	var hdr []byte
	switch {
	case n < 126:
		hdr = []byte{b0, byte(0x80 | n)}
	case n < 1<<16:
		hdr = []byte{b0, 0x80 | 126, byte(n >> 8), byte(n)}
	default:
		var e [8]byte
		binary.BigEndian.PutUint64(e[:], uint64(n))
		hdr = append([]byte{b0, 0x80 | 127}, e[:]...)
	}

	var mask [4]byte
	_, _ = rand.Read(mask[:])
	hdr = append(hdr, mask[:]...)

	maskedPayload := make([]byte, n)
	for i := range payload {
		maskedPayload[i] = payload[i] ^ mask[i%4]
	}

	if _, err := w.Write(hdr); err != nil {
		return err
	}
	_, err := w.Write(maskedPayload)
	return err
}
