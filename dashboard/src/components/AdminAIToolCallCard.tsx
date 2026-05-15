import { useState } from "react";
import type { AdminAIToolCall } from "../store/admin-ai-slice";
import { Wrench, ChevronRight, CheckCircle, XCircle, Loader2 } from "lucide-react";

const TOOL_LABELS: Record<string, string> = {
  user_management: "用户管理",
  tenant_management: "租户管理",
  tenant_user_management: "租户用户管理",
  permission_management: "权限配置",
  device_management: "设备管理",
  device_group_management: "设备分组",
  task_management: "任务管理",
  activation_management: "卡密管理",
  billing_management: "计费管理",
  config_management: "配置管理",
  system_status: "系统状态",
  stats_management: "统计信息",
  alert_management: "告警管理",
  vlm_management: "VLM 管理",
  audit_management: "审计日志",
  platform_account_management: "平台账号",
  account_management: "平台账号",
  credit_management: "积分管理",
  agent_management: "代理商管理",
  webhook_management: "Webhook 管理",
};

export default function AdminAIToolCallCard({ toolCall }: { toolCall: AdminAIToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.name] || toolCall.name;
  const hasOutput = toolCall.output !== undefined;
  const success = hasOutput && toolCall.output!.success !== false;

  return (
    <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-600/50 transition-colors"
      >
        {!hasOutput ? (
          <Loader2 size={12} className="text-gray-400 shrink-0 animate-spin" />
        ) : success ? (
          <CheckCircle size={12} className="text-green-500 shrink-0" />
        ) : (
          <XCircle size={12} className="text-red-500 shrink-0" />
        )}
        <Wrench size={12} className="text-gray-400 dark:text-slate-500 shrink-0" />
        <span className="text-gray-600 dark:text-slate-300 truncate flex-1 text-left">
          {toolCall.output?.summary || `${label}操作`}
        </span>
        <ChevronRight
          size={12}
          className={`text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-slate-600 px-2 py-1.5 space-y-1.5 bg-gray-50/50 dark:bg-slate-800/50">
          <div>
            <span className="text-gray-400 dark:text-slate-500">工具:</span>{" "}
            <span className="font-mono text-gray-700 dark:text-slate-300">{toolCall.name}</span>
          </div>
          <div>
            <span className="text-gray-400 dark:text-slate-500">输入:</span>
            <pre className="mt-0.5 text-gray-600 dark:text-slate-400 font-mono bg-gray-100 dark:bg-slate-700/50 rounded px-1.5 py-0.5 overflow-x-auto max-h-20">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.output && (
            <div>
              <span className="text-gray-400 dark:text-slate-500">
                输出 ({success ? "成功" : "失败"}):
              </span>
              <pre className="mt-0.5 text-gray-600 dark:text-slate-400 font-mono bg-gray-100 dark:bg-slate-700/50 rounded px-1.5 py-0.5 overflow-x-auto max-h-20">
                {toolCall.output.error
                  ? toolCall.output.error
                  : JSON.stringify(toolCall.output.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
