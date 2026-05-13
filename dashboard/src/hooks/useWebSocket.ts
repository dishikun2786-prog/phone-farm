import { useEffect, useRef, useCallback, useState } from 'react';

type MessageHandler = (msg: any) => void;
export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

function buildWsUrls(): string[] {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const primary = `${protocol}//${window.location.host}/ws/frontend`;
  const bypass = `wss://ws-${window.location.host}/ws/frontend`;
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
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handlersRef.current(msg);
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
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
