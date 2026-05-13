package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	natsio "github.com/nats-io/nats.go"
	edgewebrtc "github.com/phonefarm/edge-node/internal/webrtc"
	edgenats "github.com/phonefarm/edge-node/internal/nats"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	// Build info — set via ldflags
	Version   = "0.1.0"
	BuildTime = "unknown"
	GitCommit = "unknown"

	// Prometheus metrics
	messagesReceived = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "phonefarm_edge_messages_received_total",
			Help: "Total number of NATS messages received by subject.",
		},
		[]string{"subject"},
	)
	messagesPublished = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "phonefarm_edge_messages_published_total",
			Help: "Total number of NATS messages published by subject.",
		},
		[]string{"subject"},
	)
	wsConnectionsActive = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "phonefarm_edge_ws_connections_active",
			Help: "Number of active WebSocket signaling connections.",
		},
	)
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "phonefarm_edge_http_requests_total",
			Help: "Total HTTP requests by endpoint and status.",
		},
		[]string{"endpoint", "status"},
	)
)

func init() {
	prometheus.MustRegister(messagesReceived)
	prometheus.MustRegister(messagesPublished)
	prometheus.MustRegister(wsConnectionsActive)
	prometheus.MustRegister(httpRequestsTotal)
}

func main() {
	// ── Configuration from environment ──
	cfg := loadConfig()

	// ── Structured logger ──
	level := slog.LevelInfo
	if cfg.LogLevel == "debug" {
		level = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(logger)

	slog.Info("PhoneFarm Edge Node starting",
		"version", Version,
		"port", cfg.HTTPPort,
		"nats_url", cfg.NatsURL,
	)

	// ── NATS connection ──
	nc, err := natsio.Connect(cfg.NatsURL,
		natsio.Token(cfg.NatsToken),
		natsio.Name("phonefarm-edge"),
		natsio.ReconnectWait(2*time.Second),
		natsio.MaxReconnects(-1),
		natsio.DisconnectErrHandler(func(nc *natsio.Conn, err error) {
			slog.Warn("NATS disconnected", "error", err)
		}),
		natsio.ReconnectHandler(func(nc *natsio.Conn) {
			slog.Info("NATS reconnected", "url", nc.ConnectedUrl())
		}),
		natsio.ErrorHandler(func(nc *natsio.Conn, sub *natsio.Subscription, err error) {
			slog.Error("NATS error", "subject", func() string {
				if sub != nil {
					return sub.Subject
				}
				return ""
			}(), "error", err)
		}),
	)
	if err != nil {
		slog.Error("Failed to connect to NATS", "error", err)
		os.Exit(1)
	}
	defer nc.Close()
	slog.Info("NATS connected", "url", nc.ConnectedUrl())

	// ── Initialize subsystems ──
	natsHandler := edgenats.NewHandler(nc, messagesReceived, messagesPublished)
	signalingServer := edgewebrtc.NewSignalingServer(natsHandler, wsConnectionsActive)

	// ── HTTP mux ──
	mux := http.NewServeMux()

	// CORS middleware wrapper
	corsHandler := corsMiddleware(mux)

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		httpRequestsTotal.WithLabelValues("health", "200").Inc()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "healthy",
			"version":   Version,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	// Readiness check (NATS + all subsystems)
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		status := http.StatusOK
		ready := true
		if !nc.IsConnected() {
			ready = false
			status = http.StatusServiceUnavailable
		}

		httpRequestsTotal.WithLabelValues("ready", strconv.Itoa(status)).Inc()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"ready":     ready,
			"nats":      nc.IsConnected(),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	// Prometheus metrics endpoint
	mux.Handle("/metrics", promhttp.Handler())

	// WebRTC signaling WebSocket endpoint
	mux.HandleFunc("/ws/signaling", func(w http.ResponseWriter, r *http.Request) {
		deviceID := r.URL.Query().Get("device_id")
		if deviceID == "" {
			http.Error(w, "Missing device_id query parameter", http.StatusBadRequest)
			httpRequestsTotal.WithLabelValues("ws_signaling", "400").Inc()
			return
		}

		upgrader := websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins in edge deployment
			},
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Error("WebSocket upgrade failed", "error", err, "device_id", deviceID)
			httpRequestsTotal.WithLabelValues("ws_signaling", "500").Inc()
			return
		}

		httpRequestsTotal.WithLabelValues("ws_signaling", "101").Inc()
		slog.Info("WebRTC signaling connection established", "device_id", deviceID)
		signalingServer.HandleWebSocket(conn, deviceID)
	})

	// ── HTTP server ──
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler:      corsHandler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// ── Graceful shutdown ──
	ctx, stop := signal.NotifyContext(context.Background(),
		syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT,
	)
	defer stop()

	// Start server in background
	go func() {
		slog.Info("HTTP server listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for shutdown signal
	<-ctx.Done()
	slog.Info("Shutting down gracefully...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("HTTP server shutdown error", "error", err)
	}

	signalingServer.Shutdown()
	natsHandler.Close()

	slog.Info("Edge node stopped")
}

// ── Configuration ──

type Config struct {
	HTTPPort  int
	NatsURL   string
	NatsToken string
	LogLevel  string
}

func loadConfig() Config {
	port, _ := strconv.Atoi(envOrDefault("PHONEFARM_EDGE_HTTP_PORT", "9090"))
	return Config{
		HTTPPort:  port,
		NatsURL:   envOrDefault("PHONEFARM_NATS_URL", "nats://localhost:4222"),
		NatsToken: envOrDefault("PHONEFARM_NATS_TOKEN", ""),
		LogLevel:  envOrDefault("PHONEFARM_LOG_LEVEL", "info"),
	}
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// ── CORS Middleware ──

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Device-ID")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
