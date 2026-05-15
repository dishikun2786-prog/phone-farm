import { useStore } from "../store";
import { Bot, Loader2 } from "lucide-react";

export default function AdminAIChatButton() {
  const user = useStore((s) => s.user);
  const panelOpen = useStore((s) => s.panelOpen);
  const togglePanel = useStore((s) => s.togglePanel);
  const isStreaming = useStore((s) => s.isStreaming);
  const messages = useStore((s) => s.messages);

  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  if (!isAdmin) return null;

  const hasMessages = messages.length > 0 && !panelOpen;

  return (
    <button
      onClick={togglePanel}
      className="fixed bottom-4 right-4 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
      title="AI 管理助手"
      aria-label={panelOpen ? "关闭 AI 助手" : "打开 AI 助手"}
    >
      {isStreaming ? (
        <Loader2 size={24} className="animate-spin" />
      ) : (
        <Bot size={24} />
      )}
      {hasMessages && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
          {messages.length > 9 ? "9+" : messages.length}
        </span>
      )}
      {/* Pulse ring when streaming */}
      {isStreaming && (
        <span className="absolute inset-0 rounded-full bg-purple-400 animate-ping opacity-30" />
      )}
    </button>
  );
}
