import { useEffect, useRef, useCallback, useState } from 'react';

type MessageHandler = (msg: any) => void;
export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<MessageHandler>(onMessage);
  const reconnectAttemptRef = useRef(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');

  handlersRef.current = onMessage;

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/frontend`;

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      setConnectionState('connecting');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Frontend connected');
        reconnectAttemptRef.current = 0;
        if (!destroyed) setConnectionState('connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handlersRef.current(msg);
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        console.log('[WS] Frontend disconnected, reconnecting in 5s...');
        if (!destroyed) {
          setConnectionState('disconnected');
          reconnectTimer = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => {
        reconnectAttemptRef.current++;
        console.error(`[WS] Connection error (attempt #${reconnectAttemptRef.current})`);
      };
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
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
