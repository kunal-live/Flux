package hub

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"io"
	"sync"
	"testing"
	"time"

	"flux/server/protocol"
)

func packTestFrame(wireID uint32, chunkIndex uint32, payload []byte) []byte {
	buf := make([]byte, 10+len(payload))
	buf[0] = 1 // version 1
	buf[1] = 0 // kind data
	binary.BigEndian.PutUint32(buf[2:6], wireID)
	binary.BigEndian.PutUint32(buf[6:10], chunkIndex)
	copy(buf[10:], payload)
	return buf
}

func parseTestFrame(data []byte) (wireID uint32, chunkIndex uint32, payload []byte) {
	if len(data) < 10 {
		return 0, 0, nil
	}
	wireID = binary.BigEndian.Uint32(data[2:6])
	chunkIndex = binary.BigEndian.Uint32(data[6:10])
	payload = data[10:]
	return
}

func readNextFrame(r *bufio.Reader) (opcode int, payload []byte, err error) {
	var h [2]byte
	if _, err = io.ReadFull(r, h[:]); err != nil {
		return 0, nil, err
	}
	opcode = int(h[0] & 0x0f)
	n := int64(h[1] & 0x7f)
	switch n {
	case 126:
		var e [2]byte
		if _, err = io.ReadFull(r, e[:]); err != nil {
			return 0, nil, err
		}
		n = int64(binary.BigEndian.Uint16(e[:]))
	case 127:
		var e [8]byte
		if _, err = io.ReadFull(r, e[:]); err != nil {
			return 0, nil, err
		}
		n = int64(binary.BigEndian.Uint64(e[:]))
	}
	payload = make([]byte, n)
	if _, err = io.ReadFull(r, payload); err != nil {
		return 0, nil, err
	}
	return opcode, payload, nil
}

func TestConcurrentTransferStress(t *testing.T) {
	h := NewHub(time.Minute, 30*time.Minute, 0) // unlimited relay bps

	c1Client, c1Server := tcpPipe(t)
	defer c1Client.Close()
	defer c1Server.Close()

	c2Client, c2Server := tcpPipe(t)
	defer c2Client.Close()
	defer c2Server.Close()

	scope := "net:192.168.1.0/24"
	srv1 := &Conn{conn: c1Server, br: bufio.NewReader(c1Server), enforceMask: true}
	srv2 := &Conn{conn: c2Server, br: bufio.NewReader(c2Server), enforceMask: true}

	go h.ServeConn(srv1, scope, "192.168.1.10")
	go h.ServeConn(srv2, scope, "192.168.1.20")

	// 1. Register Client 1
	reg1, _ := json.Marshal(protocol.Envelope{
		Type:    protocol.TypeRegister,
		Payload: map[string]any{"alias": "Sender-MacBook"},
	})
	_ = WriteClientFrame(c1Client, true, TextMessage, reg1)

	// 2. Register Client 2
	reg2, _ := json.Marshal(protocol.Envelope{
		Type:    protocol.TypeRegister,
		Payload: map[string]any{"alias": "Receiver-PC"},
	})
	_ = WriteClientFrame(c2Client, true, TextMessage, reg2)

	r1 := bufio.NewReader(c1Client)
	r2 := bufio.NewReader(c2Client)

	// Drain initial peer list on c1
	_, _, _ = readNextFrame(r1)

	// Read peer list on c2 to get self2 id
	_, p2, err := readNextFrame(r2)
	if err != nil {
		t.Fatalf("failed to read c2 peer list: %v", err)
	}
	var env2 protocol.Envelope
	_ = json.Unmarshal(p2, &env2)
	self2, _ := env2.Payload["self"].(string)

	// Discard any incoming envelopes on c1
	go func() {
		for {
			_ = c1Client.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
			_, _, err := readNextFrame(r1)
			if err != nil {
				return
			}
		}
	}()

	// Arm relay binary route from Client 1 to Client 2
	statusEnv, _ := json.Marshal(protocol.Envelope{
		Type:    protocol.TypeTransportStatus,
		To:      self2,
		Payload: map[string]any{"mode": "relay"},
	})
	_ = WriteClientFrame(c1Client, true, TextMessage, statusEnv)
	time.Sleep(50 * time.Millisecond)

	// Run 4 concurrent simultaneous transfers
	const numTransfers = 4
	const chunksPerTransfer = 25
	const chunkSize = 16 * 1024 // 16 KiB per chunk

	type transferData struct {
		wireID uint32
		hasher [32]byte
		bytes  [][]byte
	}

	transfers := make([]transferData, numTransfers)
	wireIDSet := make(map[uint32]bool)

	for i := 0; i < numTransfers; i++ {
		var wireBuf [4]byte
		_, _ = rand.Read(wireBuf[:])
		wireID := binary.BigEndian.Uint32(wireBuf[:])
		if wireID == 0 {
			wireID = uint32(i + 1)
		}
		if wireIDSet[wireID] {
			t.Fatalf("collision in generated wireID: %d", wireID)
		}
		wireIDSet[wireID] = true

		hasher := sha256.New()
		chunks := make([][]byte, chunksPerTransfer)
		for c := 0; c < chunksPerTransfer; c++ {
			chunk := make([]byte, chunkSize)
			_, _ = rand.Read(chunk)
			chunks[c] = chunk
			hasher.Write(chunk)
		}
		var sum [32]byte
		copy(sum[:], hasher.Sum(nil))

		transfers[i] = transferData{
			wireID: wireID,
			hasher: sum,
			bytes:  chunks,
		}
	}

	// In background, receiver reads binary frames and demultiplexes by wireID
	var mu sync.Mutex
	receivedCount := make(map[uint32]int)
	receivedHashers := make(map[uint32]*sha256HashWrapper)
	for _, tr := range transfers {
		receivedHashers[tr.wireID] = &sha256HashWrapper{h: sha256.New()}
	}

	totalExpectedFrames := numTransfers * chunksPerTransfer
	var recvWg sync.WaitGroup
	recvWg.Add(1)

	go func() {
		defer recvWg.Done()
		receivedFrames := 0
		for receivedFrames < totalExpectedFrames {
			op, frameBytes, err := readNextFrame(r2)
			if err != nil {
				return
			}
			// Skip signaling envelopes (TextMessage, Ping, etc.)
			if op != BinaryMessage {
				continue
			}
			wireID, _, payload := parseTestFrame(frameBytes)
			mu.Lock()
			hw, ok := receivedHashers[wireID]
			if !ok {
				mu.Unlock()
				t.Errorf("received frame for unexpected wireID: %d", wireID)
				continue
			}
			hw.h.Write(payload)
			receivedCount[wireID]++
			receivedFrames++
			mu.Unlock()
		}
	}()

	// Interleave sending chunks concurrently from multiple sender threads
	var sendWg sync.WaitGroup
	var sendMu sync.Mutex

	for i := 0; i < numTransfers; i++ {
		sendWg.Add(1)
		go func(idx int) {
			defer sendWg.Done()
			tr := transfers[idx]
			for c := 0; c < chunksPerTransfer; c++ {
				frame := packTestFrame(tr.wireID, uint32(c), tr.bytes[c])
				sendMu.Lock()
				_ = WriteClientFrame(c1Client, true, BinaryMessage, frame)
				sendMu.Unlock()
			}
		}(i)
	}

	sendWg.Wait()
	recvWg.Wait()

	// Verify all transfers completed with identical SHA-256 digests
	mu.Lock()
	defer mu.Unlock()
	for i, tr := range transfers {
		count := receivedCount[tr.wireID]
		if count != chunksPerTransfer {
			t.Fatalf("transfer %d (wireID %d): expected %d chunks, got %d", i, tr.wireID, chunksPerTransfer, count)
		}
		hw := receivedHashers[tr.wireID]
		actualHash := hw.h.Sum(nil)
		if !bytes.Equal(actualHash, tr.hasher[:]) {
			t.Fatalf("transfer %d (wireID %d): SHA-256 hash mismatch! Data corrupted during concurrent relaying", i, tr.wireID)
		}
	}
}

type sha256HashWrapper struct {
	h interface {
		Write(p []byte) (n int, err error)
		Sum(b []byte) []byte
	}
}
