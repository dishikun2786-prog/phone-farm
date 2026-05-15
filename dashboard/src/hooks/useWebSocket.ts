import { useEffect, useRef, useCallback, useState } from 'react';

type MessageHandler = (msg: any) => void;
export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

function getToken(): string {
  try {
    const token = localStorage.getItem('token');
    return token || '';
  } catch { return ''; }
}

function buildWsUrls(): string[] {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  const primary = `${protocol}//${window.location.host}/ws/frontend${tokenParam}`;
  const bypass = `wss://ws-${window.location.host}/ws/frontend${tokenParam}`;
  return [primary, bypass];
}

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<MessageHandler>(onMessage);
  const reconnectAttemptRef = useRef(0);
  const urlIndexRef = useRef(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');

  handlersRef.current = onMessage;

  useEffect(() => {
    const urls = buildWsUrls();
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let heartbeatTimer: ReturnType<typeof setInterval>;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      setConnectionState('connecting');

      const wsUrl = urls[urlIndexRef.current % urls.length];
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS] Connected via ${wsUrl}`);
        reconnectAttemptRef.current = 0;
        urlIndexRef.current = 0;
        if (!destroyed) setConnectionState('connected');
        // Heartbeat every 30s to prevent proxy idle timeout
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'auth_required') {
            const token = getToken();
            if (token) {
              ws.send(JSON.stringify({ type: 'auth', token }));
            }
            return;
          }
          if (msg.type === 'auth_ok') { return; }
          if (msg.type === 'auth_error') {
            console.warn('[WS] Auth error:', msg.message);
            return;
          }
          handlersRef.current(msg);
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        clearInterval(heartbeatTimer);
        console.log('[WS] Disconnected, reconnecting...');
        if (!destroyed) {
          setConnectionState('disconnected');
          reconnectTimer = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => {
        reconnectAttemptRef.current++;
        console.error(`[WS] Error on ${wsUrl} (attempt #${reconnectAttemptRef.current})`);
        if (reconnectAttemptRef.current > 3) {
          urlIndexRef.current++;
          reconnectAttemptRef.current = 0;
          console.log(`[WS] Switching to alternate URL...`);
        }
      };
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      clearInterval(heartbeatTimer);
      wsRef.current?.close();
    };
  }, []);

  const subscribe = useCallback((deviceId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', deviceId }));
    }
  }, []);

  const unsubscribe = useCallback((deviceId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', deviceId }));
    }
  }, []);

  return { subscribe, unsubscribe, connectionState };
}
