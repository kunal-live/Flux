package hub

import (
	"bufio"
	"bytes"
	"io"
	"net"
	"testing"
)

func tcpPipe(t *testing.T) (net.Conn, net.Conn) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	ch := make(chan net.Conn, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		ch <- c
	}()

	client, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	server := <-ch
	return client, server
}

func TestAcceptKey_RFC6455Vector(t *testing.T) {
	// Example from RFC 6455 section 1.3.
	if got := acceptKey("dGhlIHNhbXBsZSBub25jZQ=="); got != "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=" {
		t.Fatalf("bad accept key: %q", got)
	}
}

func TestHeaderHasToken(t *testing.T) {
	if !headerHasToken("keep-alive, Upgrade", "upgrade") {
		t.Fatal("should find upgrade token case-insensitively")
	}
	if headerHasToken("keep-alive", "upgrade") {
		t.Fatal("should not find absent token")
	}
}

func TestFrameRoundTrip_Masked(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	payloads := [][]byte{
		[]byte("hello flux websocket"),
		make([]byte, 200),   // 126 path
		make([]byte, 70000), // 127 path
	}
	for i := range payloads[1] {
		payloads[1][i] = byte(i)
	}
	for i := range payloads[2] {
		payloads[2][i] = byte(i % 251)
	}

	for _, want := range payloads {
		go func(p []byte) {
			_ = WriteClientFrame(c1, true, BinaryMessage, p)
		}(want)

		typ, got, err := srv.ReadMessage()
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		if typ != BinaryMessage {
			t.Fatalf("type = %d, want %d", typ, BinaryMessage)
		}
		if !bytes.Equal(got, want) {
			t.Fatalf("len got %d want %d", len(got), len(want))
		}
	}
}

func TestUnmaskedClientFrameRejected(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	// Send an unmasked binary frame (FIN=1, opcode=2, MASK=0, len=5)
	unmasked := []byte{0x82, 0x05, 'h', 'e', 'l', 'l', 'o'}
	_, _ = c1.Write(unmasked)

	_, _, err := srv.ReadMessage()
	if err == nil {
		t.Fatal("expected error on unmasked client frame, got nil")
	}
}

func TestRSVBitRejection(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	// Frame with RSV1 bit set (0xC2 = 1100 0010)
	mask := []byte{1, 2, 3, 4}
	hdr := []byte{0xC2, 0x81, mask[0], mask[1], mask[2], mask[3], 'x' ^ mask[0]}
	_, _ = c1.Write(hdr)

	_, _, err := srv.ReadMessage()
	if err == nil {
		t.Fatal("expected error on RSV bit set, got nil")
	}
}

func TestControlFrameFragmentation(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	// Ping frame with FIN=0 (fragmented ping is illegal)
	_ = WriteClientFrame(c1, false, opPing, []byte("ping"))

	_, _, err := srv.ReadMessage()
	if err == nil {
		t.Fatal("expected error on fragmented control frame, got nil")
	}
}

func TestControlFrameOver125Bytes(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	// Ping frame with 126 bytes
	_ = WriteClientFrame(c1, true, opPing, make([]byte, 126))

	_, _, err := srv.ReadMessage()
	if err == nil {
		t.Fatal("expected error on control frame > 125 bytes, got nil")
	}
}

func TestPingPongEcho(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	pingPayload := []byte("flux-keepalive-challenge")

	go func() {
		_ = WriteClientFrame(c1, true, opPing, pingPayload)
		_ = WriteClientFrame(c1, true, TextMessage, []byte("hello after ping"))
	}()

	pongReceived := make(chan bool, 1)
	go func() {
		r := bufio.NewReader(c1)
		h := make([]byte, 2)
		if _, err := io.ReadFull(r, h); err != nil {
			pongReceived <- false
			return
		}
		opcode := h[0] & 0x0f
		if opcode == opPong {
			n := int(h[1] & 0x7f)
			payload := make([]byte, n)
			if _, err := io.ReadFull(r, payload); err == nil && bytes.Equal(payload, pingPayload) {
				pongReceived <- true
				return
			}
		}
		pongReceived <- false
	}()

	msgType, data, err := srv.ReadMessage()
	if err != nil {
		t.Fatalf("unexpected read error: %v", err)
	}
	if msgType != TextMessage || string(data) != "hello after ping" {
		t.Fatalf("unexpected message: %s", data)
	}

	select {
	case ok := <-pongReceived:
		if !ok {
			t.Fatal("pong payload mismatch or wrong opcode")
		}
	}
}

func TestFragmentedTextMessage(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	go func() {
		// Read and discard any pong written during mid-ping
		r := bufio.NewReader(c1)
		h := make([]byte, 2)
		if _, err := io.ReadFull(r, h); err == nil {
			n := int(h[1] & 0x7f)
			p := make([]byte, n)
			_, _ = io.ReadFull(r, p)
		}
	}()

	go func() {
		// First frame: text, fin=false
		_ = WriteClientFrame(c1, false, opText, []byte("fragment-1-"))
		// Interjected ping frame during fragmentation (RFC 6455 §5.4)
		_ = WriteClientFrame(c1, true, opPing, []byte("mid-ping"))
		// Second frame: continuation, fin=true
		_ = WriteClientFrame(c1, true, opContinuation, []byte("fragment-2-done"))
	}()

	msgType, data, err := srv.ReadMessage()
	if err != nil {
		t.Fatalf("failed reading fragmented message: %v", err)
	}
	if msgType != TextMessage {
		t.Fatalf("expected TextMessage, got %d", msgType)
	}
	if string(data) != "fragment-1-fragment-2-done" {
		t.Fatalf("expected reassembled text, got %q", string(data))
	}
}

func TestInvalidUTF8TextMessage(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	// 0xFF 0xFE is invalid UTF-8
	badUTF8 := []byte{0xFF, 0xFE, 0xFD}
	_ = WriteClientFrame(c1, true, opText, badUTF8)

	_, _, err := srv.ReadMessage()
	if err == nil {
		t.Fatal("expected error on invalid UTF-8 text message, got nil")
	}
}

func TestUnexpectedContinuationFrame(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	_ = WriteClientFrame(c1, true, opContinuation, []byte("orphan continuation"))

	_, _, err := srv.ReadMessage()
	if err == nil {
		t.Fatal("expected error on orphan continuation frame, got nil")
	}
}

func TestCloseFrameHandshake(t *testing.T) {
	c1, c2 := tcpPipe(t)
	defer c1.Close()
	defer c2.Close()

	srv := &Conn{conn: c2, br: bufio.NewReader(c2), enforceMask: true}

	// Close frame with code 1000 (normal closure)
	closePayload := []byte{0x03, 0xE8}
	_ = WriteClientFrame(c1, true, opClose, closePayload)

	_, _, err := srv.ReadMessage()
	if err != ErrClosed {
		t.Fatalf("expected ErrClosed, got %v", err)
	}
}
