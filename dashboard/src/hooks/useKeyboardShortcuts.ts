import { useEffect, useRef } from 'react';

interface ShortcutHandlers {
  onToggleTheme?: () => void;
  onFocusSearch?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const h = handlersRef.current;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!isInput) h.onFocusSearch?.();
        return;
      }

      if ((e.key === 'b' || e.key === 'B') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        h.onToggleTheme?.();
        return;
      }

      if (e.key === 'Escape') {
        if (!isInput) h.onEscape?.();
        return;
      }

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        h.onFocusSearch?.();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []); // Only register once — handlers accessed via ref
}
