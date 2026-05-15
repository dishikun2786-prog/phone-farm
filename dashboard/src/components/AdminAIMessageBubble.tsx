import { useState } from "react";
import type { AdminAIMessage } from "../store/admin-ai-slice";
import AdminAIToolCallCard from "./AdminAIToolCallCard";
import { Copy, Check } from "lucide-react";

export default function AdminAIMessageBubble({ message }: { message: AdminAIMessage }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers / non-HTTPS
      const ta = document.createElement("textarea");
      ta.value = message.content;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const timeStr = new Date(message.createdAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
          isUser
            ? "bg-blue-600 text-white rounded-br-md"
            : "bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-bl-md"
        }`}
      >
        {/* Text content */}
        <div className="whitespace-pre-wrap break-words">
          {renderContent(message.content)}
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.toolCalls.map((tc, i) => (
              <AdminAIToolCallCard key={`${tc.name}-${i}`} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Timestamp + Copy (assistant messages only) */}
        <div className={`flex items-center gap-1.5 mt-1.5 ${isUser ? "justify-end" : "justify-between"}`}>
          <span className="text-xs opacity-50">{timeStr}</span>
          {!isUser && message.content && (
            <button
              onClick={handleCopy}
              className="text-xs opacity-40 hover:opacity-80 transition-opacity flex items-center gap-0.5"
              aria-label={copied ? "已复制" : "复制消息"}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied && <span>已复制</span>}
            </button>
          )}
          {isUser && (
            <span className="text-xs opacity-50">{timeStr}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Escape HTML special chars to prevent XSS */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Simple content renderer: escape HTML first, then apply safe markdown */
function renderContent(content: string): React.ReactNode {
  if (!content) return null;

  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const code = part.replace(/```\w*\n?/g, "").replace(/```$/g, "");
      return (
        <code key={i} className="block my-1 px-2 py-1 bg-gray-200 dark:bg-slate-600 rounded text-xs font-mono overflow-x-auto">
          {code}
        </code>
      );
    }
    const escaped = escapeHtml(part);
    return (
      <span
        key={i}
        dangerouslySetInnerHTML={{
          __html: escaped
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/`([^`]+)`/g, "<code class='bg-gray-200 dark:bg-slate-600 px-1 rounded text-xs font-mono'>$1</code>")
            .replace(/\|(.+)\|/g, (_match) => {
              const cells = _match.split("|").filter((c) => c.trim());
              return `<span class='text-xs'>${cells.map((c) => c.trim()).join(" | ")}</span>`;
            }),
        }}
      />
    );
  });
}
