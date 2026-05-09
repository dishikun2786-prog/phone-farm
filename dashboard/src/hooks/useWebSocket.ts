import { useEffect, useRef, useCallback } from 'react';

type MessageHandler = (msg: any) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<MessageHandler>(onMessage);

  handlersRef.current = onMessage;

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/frontend`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => console.log('[WS] Frontend connected');
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handlersRef.current(msg);
      } catch { /* ignore */ }
    };
    ws.onclose = () => console.log('[WS] Frontend disconnected, reconnecting in 5s...');
    ws.onerror = () => {};

    // Reconnect on close
    let reconnectTimer: ReturnType<typeof setTimeout>;
    const onClose = () => {
      reconnectTimer = setTimeout(() => {
        const newWs = new WebSocket(wsUrl);
        wsRef.current = newWs;
        newWs.onopen = ws.onopen;
        newWs.onmessage = ws.onmessage;
        newWs.onclose = onClose;
        newWs.onerror = ws.onerror;
      }, 5000);
    };
    ws.addEventListener('close', onClose);

    return () => {
      clearTimeout(reconnectTimer);
      ws.removeEventListener('close', onClose);
      ws.close();
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

  return { subscribe, unsubscribe };
}
