// Package webrtc provides WebRTC signaling relay for P2P device connections.
//
// It manages active signaling sessions between devices, routing SDP offers,
// answers, and ICE candidates through NATS for cross-region relay, and
// directly through WebSocket connections for same-edge peers.
package webrtc

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	natshandler "github.com/phonefarm/edge-node/internal/nats"
	"github.com/prometheus/client_golang/prometheus"
)

// ── Signaling Message Types ──

const (
	MsgTypeOffer           = "webrtc_offer"
	MsgTypeAnswer          = "webrtc_answer"
	MsgTypeIceCandidate    = "webrtc_ice"
	MsgTypeConnectRequest  = "webrtc_connect_request"
	MsgTypeConnectAccept   = "webrtc_connect_accept"
	MsgTypeConnectReject   = "webrtc_connect_reject"
)

// SignalingMessage is the JSON structure exchanged over the signaling channel.
type SignalingMessage struct {
	Type      string `json:"type"`
	From      string `json:"from"`
	To        string `json:"to"`
	SDP       string `json:"sdp,omitempty"`
	Candidate string `json:"candidate,omitempty"`
	SdpMid    string `json:"sdpMid,omitempty"`
	SdpMLine  int    `json:"sdpMLineIndex,omitempty"`
	Reason    string `json:"reason,omitempty"`
	Timestamp int64  `json:"timestamp,omitempty"`
}

// ── Session ──

// session represents an active signaling connection for a device.
type session struct {
	deviceID   string
	conn       *websocket.Conn
	lastPing   time.Time
	mu         sync.Mutex
}

// SendJSON sends a JSON-encoded signaling message to the device.
func (s *session) SendJSON(msg SignalingMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.WriteJSON(msg)
}

// ── SignalingServer ──

// SignalingServer manages WebRTC signaling between devices, routing messages
// directly to WebSocket-connected peers or via NATS for cross-edge routing.
type SignalingServer struct {
	natsHandler *natshandler.Handler

	mu       sync.RWMutex
	sessions map[string]*session // deviceID → session

	wsConnectionsActive prometheus.Gauge

	// Heartbeat configuration
	pingInterval time.Duration
	pingTimeout  time.Duration
}

// NewSignalingServer creates a new signaling server.
func NewSignalingServer(natsHandler *natshandler.Handler, wsGauge prometheus.Gauge) *SignalingServer {
	s := &SignalingServer{
		natsHandler:         natsHandler,
		sessions:            make(map[string]*session),
		wsConnectionsActive: wsGauge,
		pingInterval:        15 * time.Second,
		pingTimeout:         45 * time.Second,
	}
	return s
}

// ── Session Management ──

// HandleWebSocket manages a WebSocket signaling connection for a device.
// This is a blocking call that runs until the connection closes.
func (s *SignalingServer) HandleWebSocket(conn *websocket.Conn, deviceID string) {
	sess := &session{
		deviceID: deviceID,
		conn:     conn,
		lastPing: time.Now(),
	}

	s.mu.Lock()
	// Close existing session for this device if any (reconnection)
	if existing, ok := s.sessions[deviceID]; ok {
		existing.conn.Close()
	}
	s.sessions[deviceID] = sess
	s.wsConnectionsActive.Inc()
	s.mu.Unlock()

	slog.Info("Signaling session started", "device_id", deviceID)

	defer func() {
		s.mu.Lock()
		delete(s.sessions, deviceID)
		s.wsConnectionsActive.Dec()
		s.mu.Unlock()
		conn.Close()
		slog.Info("Signaling session ended", "device_id", deviceID)
	}()

	// Configure read deadline
	conn.SetReadDeadline(time.Now().Add(s.pingTimeout))

	// Pong handler resets the deadline
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(s.pingTimeout))
		sess.lastPing = time.Now()
		return nil
	})

	// Ping ticker
	pingTicker := time.NewTicker(s.pingInterval)
	defer pingTicker.Stop()

	go func() {
		for range pingTicker.C {
			sess.mu.Lock()
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				sess.mu.Unlock()
				return
			}
			sess.mu.Unlock()
		}
	}()

	// Read loop
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Warn("Signaling WebSocket error", "device_id", deviceID, "error", err)
			}
			return
		}

		sess.lastPing = time.Now()

		var msg SignalingMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			slog.Warn("Invalid signaling message", "device_id", deviceID, "error", err)
			continue
		}

		// Ensure from field matches the authenticated device
		if msg.From == "" {
			msg.From = deviceID
		}
		msg.Timestamp = time.Now().UnixMilli()

		s.routeMessage(msg)
	}
}

// ── Message Routing ──

// RouteOffer sends an SDP offer from one device to another.
func (s *SignalingServer) RouteOffer(fromID, toID, sdp string) error {
	return s.sendToDevice(toID, SignalingMessage{
		Type: MsgTypeOffer,
		From: fromID,
		To:   toID,
		SDP:  sdp,
	})
}

// RouteAnswer sends an SDP answer from one device to another.
func (s *SignalingServer) RouteAnswer(fromID, toID, sdp string) error {
	return s.sendToDevice(toID, SignalingMessage{
		Type: MsgTypeAnswer,
		From: fromID,
		To:   toID,
		SDP:  sdp,
	})
}

// RouteICECandidate sends an ICE candidate from one device to another.
func (s *SignalingServer) RouteICECandidate(fromID, toID, candidate string) error {
	return s.sendToDevice(toID, SignalingMessage{
		Type:      MsgTypeIceCandidate,
		From:      fromID,
		To:        toID,
		Candidate: candidate,
	})
}

// ── Private ──

// routeMessage determines where to send a signaling message based on the
// target peer's location (same edge vs. cross-edge).
func (s *SignalingServer) routeMessage(msg SignalingMessage) {
	slog.Debug("Routing signaling message",
		"type", msg.Type,
		"from", msg.From,
		"to", msg.To,
	)

	// Try direct delivery if the target is connected to this edge node
	if s.sendToDevice(msg.To, msg) {
		return
	}

	// Cross-edge: publish to NATS for routing to another edge node
	data, err := json.Marshal(msg)
	if err != nil {
		slog.Error("Failed to marshal cross-edge signaling message", "error", err)
		return
	}

	subject := fmt.Sprintf("phonefarm.signaling.%s", msg.To)
	if err := s.natsHandler.PublishRaw(subject, data); err != nil {
		slog.Error("Failed to publish cross-edge signaling message",
			"subject", subject,
			"error", err,
		)
	}
}

// sendToDevice attempts to deliver a signaling message directly via WebSocket.
// Returns true if the device has an active session on this edge node.
func (s *SignalingServer) sendToDevice(deviceID string, msg SignalingMessage) bool {
	s.mu.RLock()
	sess, ok := s.sessions[deviceID]
	s.mu.RUnlock()

	if !ok {
		return false
	}

	if err := sess.SendJSON(msg); err != nil {
		slog.Warn("Failed to send signaling message to device",
			"device_id", deviceID,
			"type", msg.Type,
			"error", err,
		)
		return false
	}

	return true
}

// ── Lifecycle ──

// ActiveSessions returns the number of devices currently connected for signaling.
func (s *SignalingServer) ActiveSessions() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.sessions)
}

// GetSessionDeviceIDs returns all device IDs with active signaling sessions.
func (s *SignalingServer) GetSessionDeviceIDs() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := make([]string, 0, len(s.sessions))
	for id := range s.sessions {
		ids = append(ids, id)
	}
	return ids
}

// HasSession checks if a device has an active signaling session on this edge node.
func (s *SignalingServer) HasSession(deviceID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.sessions[deviceID]
	return ok
}

// Shutdown closes all signaling sessions gracefully.
func (s *SignalingServer) Shutdown() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for deviceID, sess := range s.sessions {
		closeMsg := websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutdown")
		sess.conn.WriteMessage(websocket.CloseMessage, closeMsg)
		sess.conn.Close()
		s.wsConnectionsActive.Dec()
		slog.Info("Signaling session closed during shutdown", "device_id", deviceID)
	}
	s.sessions = make(map[string]*session)
	slog.Info("Signaling server shut down")
}
