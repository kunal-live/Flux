package hub

import (
	"bufio"
	"net"
	"testing"
	"time"
)

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

func TestFrameRoundTrip(t *testing.T) {
	c1, c2 := net.Pipe()
	a := &Conn{conn: c1, br: bufio.NewReader(c1)}
	b := &Conn{conn: c2, br: bufio.NewReader(c2)}

	payloads := [][]byte{
		[]byte("hello"),
		make([]byte, 200),   // 2-byte length path
		make([]byte, 70000), // 8-byte length path
	}
	for i := range payloads[1] {
		payloads[1][i] = byte(i)
	}

	for _, want := range payloads {
		go func(p []byte) { _ = a.WriteMessage(BinaryMessage, p) }(want)
		typ, got, err := b.ReadMessage()
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		if typ != BinaryMessage {
			t.Fatalf("type = %d", typ)
		}
		if len(got) != len(want) {
			t.Fatalf("len got %d want %d", len(got), len(want))
		}
	}
	_ = time.Now
}
