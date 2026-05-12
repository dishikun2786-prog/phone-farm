import { useEffect } from 'react';

interface ShortcutHandlers {
  onToggleTheme?: () => void;
  onFocusSearch?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!isInput) {
          handlers.onFocusSearch?.();
        }
        return;
      }

      if ((e.key === 'b' || e.key === 'B') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handlers.onToggleTheme?.();
        return;
      }

      if (e.key === 'Escape') {
        if (!isInput) {
          handlers.onEscape?.();
        }
        return;
      }

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        handlers.onFocusSearch?.();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
