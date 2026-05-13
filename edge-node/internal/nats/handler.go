// Package nats provides NATS message handling for the PhoneFarm edge node.
//
// It bridges the control server's NATS pub/sub with edge-side device management,
// supporting device event subscription, task status publication, and
// request-reply device command dispatch.
package nats

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	natsio "github.com/nats-io/nats.go"
	"github.com/prometheus/client_golang/prometheus"
)

// ── Domain Types ──

// DeviceEvent represents a device state change pushed via NATS.
type DeviceEvent struct {
	DeviceID  string                 `json:"device_id"`
	EventType string                 `json:"event_type"` // "online", "offline", "heartbeat"
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// TaskStatus reports the current state of a task running on a device.
type TaskStatus struct {
	TaskID    string    `json:"task_id"`
	Status    string    `json:"status"` // "pending", "running", "completed", "failed", "timeout"
	Step      int       `json:"step"`
	Message   string    `json:"message,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// DeviceAction describes a command to execute on a device.
type DeviceAction struct {
	ActionType string                 `json:"action_type"`
	Params     map[string]interface{} `json:"params"`
}

// ActionResult is the response from executing a DeviceAction on a device.
type ActionResult struct {
	Success  bool          `json:"success"`
	Output   string        `json:"output,omitempty"`
	Error    string        `json:"error,omitempty"`
	Duration time.Duration `json:"duration_ms"`
}

// Stats provides a snapshot of handler state.
type Stats struct {
	ActiveSubscriptions int   `json:"active_subscriptions"`
	TasksPublished      int64 `json:"tasks_published"`
	CommandsDispatched  int64 `json:"commands_dispatched"`
}

// ── NATS Subject Constants ──

const (
	SubjectDeviceEvents    = "phonefarm.devices.%s.events"     // device_id
	SubjectDeviceCommand   = "phonefarm.devices.%s.command"    // device_id
	SubjectTaskStatus      = "phonefarm.tasks.%s.status"       // task_id
	SubjectTaskResult      = "phonefarm.tasks.%s.result"       // task_id
	SubjectDeviceActionReq = "phonefarm.devices.%s.action.req" // device_id
	SubjectDeviceActionRes = "phonefarm.devices.%s.action.res" // device_id
)

// RequestTimeout is the default timeout for device action request-reply.
const RequestTimeout = 30 * time.Second

// ── Handler ──

// Handler manages all NATS interactions for the edge node.
type Handler struct {
	nc *natsio.Conn

	mu            sync.Mutex
	subscriptions []*natsio.Subscription

	messagesReceived *prometheus.CounterVec
	messagesPublished *prometheus.CounterVec

	tasksPublished    atomic.Int64
	commandsDispatched atomic.Int64
}

// NewHandler creates a new Handler wrapping the given NATS connection.
func NewHandler(nc *natsio.Conn, messagesReceived *prometheus.CounterVec, messagesPublished *prometheus.CounterVec) *Handler {
	return &Handler{
		nc:                nc,
		messagesReceived:  messagesReceived,
		messagesPublished: messagesPublished,
	}
}

// ── Public Methods ──

// SubscribeDeviceEvents subscribes to device lifecycle events (online/offline/heartbeat).
// The handler function is called for each event received on any device.
func (h *Handler) SubscribeDeviceEvents(handler func(event DeviceEvent)) error {
	subject := fmt.Sprintf(SubjectDeviceEvents, "*")

	sub, err := h.nc.Subscribe(subject, func(msg *natsio.Msg) {
		h.messagesReceived.WithLabelValues("device_events").Inc()
		var event DeviceEvent
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			slog.Error("Failed to unmarshal device event", "error", err, "subject", msg.Subject)
			return
		}
		handler(event)
	})
	if err != nil {
		return fmt.Errorf("subscribe device events: %w", err)
	}

	h.mu.Lock()
	h.subscriptions = append(h.subscriptions, sub)
	h.mu.Unlock()

	slog.Info("Subscribed to device events", "subject", subject)
	return nil
}

// SubscribeDeviceCommand subscribes to commands targeting a specific device.
func (h *Handler) SubscribeDeviceCommand(deviceID string, handler func(action DeviceAction) (*ActionResult, error)) error {
	subject := fmt.Sprintf(SubjectDeviceCommand, deviceID)

	sub, err := h.nc.Subscribe(subject, func(msg *natsio.Msg) {
		h.messagesReceived.WithLabelValues("device_command").Inc()
		var action DeviceAction
		if err := json.Unmarshal(msg.Data, &action); err != nil {
			slog.Error("Failed to unmarshal device action", "error", err, "subject", msg.Subject)
			return
		}

		result, err := handler(action)
		if err != nil {
			result = &ActionResult{Success: false, Error: err.Error()}
		}

		// Reply on the reply subject if provided
		if msg.Reply != "" {
			replyData, _ := json.Marshal(result)
			h.nc.Publish(msg.Reply, replyData)
			h.messagesPublished.WithLabelValues("device_command_reply").Inc()
		}
	})
	if err != nil {
		return fmt.Errorf("subscribe device command: %w", err)
	}

	h.mu.Lock()
	h.subscriptions = append(h.subscriptions, sub)
	h.mu.Unlock()

	slog.Info("Subscribed to device commands", "subject", subject)
	return nil
}

// PublishTaskUpdate sends a task status update to the NATS cluster.
func (h *Handler) PublishTaskUpdate(taskID string, status TaskStatus) error {
	subject := fmt.Sprintf(SubjectTaskStatus, taskID)
	status.Timestamp = time.Now().UTC()

	data, err := json.Marshal(status)
	if err != nil {
		return fmt.Errorf("marshal task status: %w", err)
	}

	if err := h.nc.Publish(subject, data); err != nil {
		return fmt.Errorf("publish task status: %w", err)
	}

	h.messagesPublished.WithLabelValues("task_status").Inc()
	h.tasksPublished.Add(1)
	slog.Debug("Published task update", "task_id", taskID, "status", status.Status)
	return nil
}

// PublishTaskResult sends a final task result.
func (h *Handler) PublishTaskResult(taskID string, result ActionResult) error {
	subject := fmt.Sprintf(SubjectTaskResult, taskID)

	data, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("marshal task result: %w", err)
	}

	if err := h.nc.Publish(subject, data); err != nil {
		return fmt.Errorf("publish task result: %w", err)
	}

	h.messagesPublished.WithLabelValues("task_result").Inc()
	return nil
}

// RequestDeviceAction sends a command to a device and waits for the response
// using the NATS request-reply pattern.
func (h *Handler) RequestDeviceAction(deviceID string, action DeviceAction) (*ActionResult, error) {
	subject := fmt.Sprintf(SubjectDeviceActionReq, deviceID)

	data, err := json.Marshal(action)
	if err != nil {
		return nil, fmt.Errorf("marshal device action: %w", err)
	}

	h.messagesPublished.WithLabelValues("device_action").Inc()
	h.commandsDispatched.Add(1)

	msg, err := h.nc.Request(subject, data, RequestTimeout)
	if err != nil {
		return nil, fmt.Errorf("request device action: %w", err)
	}

	h.messagesReceived.WithLabelValues("device_action_res").Inc()

	var result ActionResult
	if err := json.Unmarshal(msg.Data, &result); err != nil {
		return nil, fmt.Errorf("unmarshal action result: %w", err)
	}

	return &result, nil
}

// PublishDeviceEvent sends a device lifecycle event.
func (h *Handler) PublishDeviceEvent(event DeviceEvent) error {
	subject := fmt.Sprintf(SubjectDeviceEvents, event.DeviceID)
	event.Timestamp = time.Now().UTC()

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal device event: %w", err)
	}

	if err := h.nc.Publish(subject, data); err != nil {
		return fmt.Errorf("publish device event: %w", err)
	}

	h.messagesPublished.WithLabelValues("device_events").Inc()
	return nil
}

// PublishRaw publishes raw data to a NATS subject without JSON marshaling.
func (h *Handler) PublishRaw(subject string, data []byte) error {
	return h.nc.Publish(subject, data)
}

// Stats returns current handler statistics.
func (h *Handler) Stats() Stats {
	h.mu.Lock()
	subCount := len(h.subscriptions)
	h.mu.Unlock()

	return Stats{
		ActiveSubscriptions: subCount,
		TasksPublished:      h.tasksPublished.Load(),
		CommandsDispatched:  h.commandsDispatched.Load(),
	}
}

// Close unsubscribes all active subscriptions. It does NOT close the
// underlying NATS connection -- that is the caller's responsibility.
func (h *Handler) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for _, sub := range h.subscriptions {
		if err := sub.Unsubscribe(); err != nil {
			slog.Warn("Error unsubscribing from NATS", "subject", sub.Subject, "error", err)
		}
	}
	h.subscriptions = nil
	slog.Info("NATS handler closed", "subscriptions_cleared", true)
}
