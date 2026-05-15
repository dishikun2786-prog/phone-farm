package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/pion/turn/v4"
)

func main() {
	publicIP := flag.String("public-ip", "", "Public IP address of the TURN server")
	port := flag.Int("port", 3478, "Listening port for TURN/STUN")
	user := flag.String("user", "phonefarm", "TURN username")
	password := flag.String("password", "", "TURN password (required)")
	realm := flag.String("realm", "phone.openedskill.com", "TURN realm")
	flag.Parse()

	if *password == "" {
		// Try env var
		*password = os.Getenv("TURN_PASSWORD")
	}
	if *password == "" {
		log.Fatal("TURN password required: use -password flag or TURN_PASSWORD env var")
	}
	if *publicIP == "" {
		*publicIP = os.Getenv("TURN_PUBLIC_IP")
	}
	if *publicIP == "" {
		// Auto-detect public IP
		ip, err := detectPublicIP()
		if err != nil {
			log.Fatalf("Cannot detect public IP: %v. Use -public-ip flag", err)
		}
		*publicIP = ip
	}

	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	udpListener, err := net.ListenPacket("udp4", addr)
	if err != nil {
		log.Fatalf("Failed to create UDP listener on %s: %v", addr, err)
	}

	log.Printf("PhoneFarm TURN/STUN Server")
	log.Printf("  Public IP  : %s", *publicIP)
	log.Printf("  Listen     : %s (UDP)", addr)
	log.Printf("  Realm      : %s", *realm)
	log.Printf("  User       : %s", *user)

	// Create the TURN server with long-term credential auth handler
	server, err := turn.NewServer(turn.ServerConfig{
		Realm: *realm,
		AuthHandler: func(username string, realm string, _ net.Addr) (key []byte, ok bool) {
			if username == *user {
				// Long-term credential mechanism: key = MD5(username:realm:password)
				return turn.GenerateAuthKey(username, realm, *password), true
			}
			return nil, false
		},
		PacketConnConfigs: []turn.PacketConnConfig{
			{
				PacketConn: udpListener,
				RelayAddressGenerator: &turn.RelayAddressGeneratorStatic{
					RelayAddress: net.ParseIP(*publicIP),
					Address:      "0.0.0.0",
				},
			},
		},
	})
	if err != nil {
		log.Fatalf("Failed to create TURN server: %v", err)
	}

	log.Printf("  Status     : RUNNING")

	// Wait for shutdown signal
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down TURN server...")
	if err := server.Close(); err != nil {
		log.Printf("Error during shutdown: %v", err)
	}
	log.Println("TURN server stopped.")
}

func detectPublicIP() (string, error) {
	// Try STUN first
	conn, err := net.Dial("udp4", "stun.l.google.com:19302")
	if err != nil {
		return "", fmt.Errorf("no network: %w", err)
	}
	defer conn.Close()

	// Use a simple STUN binding request to discover public IP
	// This is a minimal STUN Binding request
	request := make([]byte, 20)
	// STUN header: Message Type = Binding Request (0x0001)
	request[0] = 0x00
	request[1] = 0x01
	// Message Length = 0 (no attributes)
	// Magic Cookie = 0x2112A442
	request[4] = 0x21
	request[5] = 0x12
	request[6] = 0xA4
	request[7] = 0x42
	// Transaction ID = random (just use all zeros for simplicity)

	if _, err := conn.Write(request); err != nil {
		return "", fmt.Errorf("STUN request failed: %w", err)
	}

	buf := make([]byte, 1500)
	n, err := conn.Read(buf)
	if err != nil {
		return "", fmt.Errorf("STUN read failed: %w", err)
	}

	// Parse XOR-MAPPED-ADDRESS from STUN response
	// For simplicity, use the local address of the connection
	// This won't give us the public IP directly
	_ = n

	// Fallback: use the connection's local address approach
	// Actually, let's parse the STUN response properly
	for i := 20; i+4 <= n; {
		attrType := uint16(buf[i])<<8 | uint16(buf[i+1])
		attrLen := int(uint16(buf[i+2])<<8 | uint16(buf[i+3]))
		// Align to 4 bytes
		paddedLen := (attrLen + 3) & ^3

		if attrType == 0x0020 { // XOR-MAPPED-ADDRESS
			if i+4+8 > n {
				break
			}
			// Skip first byte (reserved), second byte is family (0x01 = IPv4)
			family := buf[i+5]
			if family == 0x01 {
				// XOR the IP with magic cookie
				ip := net.IPv4(
					buf[i+8]^0x21,
					buf[i+9]^0x12,
					buf[i+10]^0xA4,
					buf[i+11]^0x42,
				)
				return ip.String(), nil
			}
		}
		i += 4 + paddedLen
	}

	return "", fmt.Errorf("could not detect public IP via STUN")
}
