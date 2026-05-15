import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../store";
import AdminAIMessageBubble from "./AdminAIMessageBubble";
import { X, Plus, History, Trash2, Send, Loader2, AlertCircle, ChevronDown } from "lucide-react";

export default function AdminAIChatPanel() {
  const panelOpen = useStore((s) => s.panelOpen);
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const error = useStore((s) => s.error);
  const sendMessage = useStore((s) => s.sendMessage);
  const newConversation = useStore((s) => s.newConversation);
  const clearError = useStore((s) => s.clearError);
  const togglePanel = useStore((s) => s.togglePanel);

  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [closing, setClosing] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // ── Close with animation ──
  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      togglePanel();
    }, 250);
  }, [togglePanel]);

  // Escape key to close
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showHistory) setShowHistory(false);
        else handleClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen, showHistory, handleClose]);

  // Auto-scroll to bottom on new messages (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming, userScrolledUp]);

  // Focus input on open
  useEffect(() => {
    if (panelOpen && !closing) {
      // small delay for animation to start
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [panelOpen, closing]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isUp = el.scrollHeight - el.scrollTop - el.clientHeight > 100;
    setUserScrolledUp(isUp);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUserScrolledUp(false);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text);
    setUserScrolledUp(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!panelOpen && !closing) return null;

  const inputCharsLeft = 500 - input.length;

  return (
    <div
      role="dialog"
      aria-label="AI 管理助手"
      aria-modal="true"
      className={
        "fixed z-40 bg-white dark:bg-slate-800 shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col overflow-hidden " +
        // Responsive: fullscreen on mobile, side panel on >=sm
        "max-sm:inset-0 max-sm:rounded-none " +
        "sm:bottom-20 sm:right-4 sm:w-80 md:w-96 sm:h-[600px] sm:max-h-[calc(100vh-6rem)] sm:rounded-xl " +
        (closing
          ? "max-sm:animate-slide-out-down sm:animate-slide-out-right"
          : "max-sm:animate-slide-up sm:animate-slide-in-right")
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">AI</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI 管理助手</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">DeepSeek V4 Flash</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="会话历史"
          >
            <History size={16} />
          </button>
          <button
            onClick={newConversation}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="新对话"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="关闭助手"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative"
      >
        {messages.length === 0 && !isStreaming && (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-3">
              <span className="text-purple-600 dark:text-purple-400 text-lg font-bold">AI</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">你好！我是 AI 管理助手</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              你可以通过自然语言让我执行管理操作，例如：<br />
              "显示所有活跃用户"<br />
              "创建一个新租户"<br />
              "查看设备在线率"
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <AdminAIMessageBubble key={msg.id} message={msg} />
        ))}

        {isStreaming && (
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500 py-2">
            <Loader2 size={14} className="animate-spin" />
            AI 正在思考...
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={clearError} className="ml-auto shrink-0 text-red-400 hover:text-red-600" aria-label="清除错误">
              <X size={14} />
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />

        {/* Scroll-to-bottom FAB */}
        {userScrolledUp && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-0 float-right mr-1 w-8 h-8 rounded-full bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-slate-300 transition-all hover:scale-110"
            aria-label="滚动到底部"
          >
            <ChevronDown size={16} />
          </button>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-slate-700 p-3 shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入管理指令..."
              rows={1}
              maxLength={500}
              className="w-full resize-none border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-24"
              disabled={isStreaming}
            />
            {input.length > 400 && (
              <span className={`absolute right-2 bottom-1.5 text-xs ${inputCharsLeft < 50 ? "text-red-400" : "text-gray-400"}`}>
                {inputCharsLeft}
              </span>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="p-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            aria-label="发送消息"
          >
            {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {/* Session History (overlay) */}
      <div
        className={
          "absolute inset-0 bg-white dark:bg-slate-800 z-10 flex flex-col transition-all duration-200 " +
          (showHistory ? "opacity-100 visible" : "opacity-0 invisible")
        }
      >
        <SessionHistoryPanel onClose={() => setShowHistory(false)} />
      </div>
    </div>
  );
}

function SessionHistoryPanel({ onClose }: { onClose: () => void }) {
  const sessions = useStore((s) => s.sessions);
  const sessionsLoading = useStore((s) => s.sessionsLoading);
  const loadSessions = useStore((s) => s.loadSessions);
  const switchSession = useStore((s) => s.switchSession);
  const deleteSession = useStore((s) => s.deleteSession);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700 shrink-0">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">会话历史</h4>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded"
          aria-label="关闭历史"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">暂无历史会话</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-100 dark:border-slate-700/50"
              onClick={() => { switchSession(s.id); onClose(); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") { switchSession(s.id); onClose(); } }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">{s.title || "新对话"}</p>
                <p className="text-xs text-gray-400">{new Date(s.updatedAt).toLocaleString("zh-CN")}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                aria-label="删除会话"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
