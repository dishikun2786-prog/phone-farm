import { useEffect, useCallback, useRef } from 'react';

interface UseClipboardSyncOptions {
  deviceId: string;
  wsRef: React.MutableRefObject<WebSocket | null>;
  enabled?: boolean;
}

/**
 * Bidirectional clipboard sync between browser and Android device.
 *
 * Browser → Device: listens for Ctrl+C / copy events, sends text to device via WebSocket.
 * Device → Browser: WebSocket clipboard messages write to navigator.clipboard.
 */
export function useClipboardSync({ deviceId, wsRef, enabled = true }: UseClipboardSyncOptions) {
  const lastSentRef = useRef('');

  const sendToDevice = useCallback((text: string) => {
    if (!text || text === lastSentRef.current) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'clipboard', deviceId, text }));
      lastSentRef.current = text;
    }
  }, [deviceId, wsRef]);

  useEffect(() => {
    if (!enabled) return;

    const handleCopy = (e: ClipboardEvent) => {
      const text = window.getSelection()?.toString() || e.clipboardData?.getData('text/plain') || '';
      // Small delay to let clipboard actually fill
      setTimeout(async () => {
        try {
          const clipText = await navigator.clipboard.readText();
          sendToDevice(clipText);
        } catch { /* clipboard access denied */ }
      }, 100);
    };

    // Also poll clipboard on window focus
    const handleFocus = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text !== lastSentRef.current) {
          sendToDevice(text);
        }
      } catch { /* */ }
    };

    document.addEventListener('copy', handleCopy);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('copy', handleCopy);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, sendToDevice]);

  return { sendToDevice };
}
