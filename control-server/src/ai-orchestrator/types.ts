/**
 * AI Orchestrator — 分布式 AI Agent 协同协议类型
 *
 * 架构参考: Microsoft Autogen v0.4+ Distributed Agent Runtime (gRPC Host 模式)
 * 传输层: PhoneFarm BridgeServer WebSocket 隧道 (等效 gRPC bidirectional stream)
 *
 * Claude Code (本地) ←→ BridgeServer (VPS) ←→ DeepSeek Worker (VPS)
 *     orchestrator            hub                  agent runtime
 */

// ── Agent Identity ──

export interface AgentIdentity {
  /** "claude-code" | "deepseek-worker" */
  role: "claude-code" | "deepseek-worker";
  /** 唯一实例 ID */
  instanceId: string;
  /** 人类可读标签 */
  label?: string;
  /** 支持的 capability 列表 */
  capabilities: AgentCapability[];
}

export type AgentCapability =
  | "shell_exec"       // 执行 shell 命令
  | "file_write"       // 写入文件
  | "file_read"        // 读取文件
  | "file_list"        // 列出目录
  | "npm_exec"         // npm/npx 操作
  | "git_exec"         // git 操作
  | "docker_exec"      // docker 操作
  | "http_fetch"       // HTTP 请求
  | "code_analyze"     // 代码分析 (DeepSeek)
  | "deploy_orchestrate"; // 部署编排 (Claude Code)

// ── Task Messages ──

export type AiMessageType =
  // Handshake
  | "ai_handshake"
  | "ai_handshake_ack"
  // Task lifecycle
  | "ai_task_assign"
  | "ai_task_accept"
  | "ai_task_reject"
  | "ai_task_progress"
  | "ai_task_complete"
  | "ai_task_failed"
  // Streaming
  | "ai_stream_chunk"
  | "ai_stream_end"
  // File operations
  | "ai_file_req"
  | "ai_file_res"
  // Heartbeat
  | "ai_ping"
  | "ai_pong"
  // Human approval gate
  | "ai_approval_req"
  | "ai_approval_res";

// ── Task Status ──

export type AiTaskStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "running"
  | "streaming"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

// ── Message Envelope ──

export interface AiMessage {
  type: AiMessageType;
  /** 消息唯一 ID */
  msgId: string;
  /** 关联的任务 ID (handshake/ping 可为空) */
  taskId?: string;
  /** 发送者身份 */
  from: AgentIdentity;
  /** 目标身份 (broadcast 时为空) */
  to?: AgentIdentity;
  /** 时间戳 ISO */
  ts: string;
  /** 载荷 */
  payload: AiPayload;
}

// ── Payload Variants ──

export type AiPayload =
  | AiHandshakePayload
  | AiTaskAssignPayload
  | AiTaskProgressPayload
  | AiTaskCompletePayload
  | AiStreamChunkPayload
  | AiFilePayload
  | AiApprovalPayload
  | Record<string, unknown>;

export interface AiHandshakePayload {
  agent: AgentIdentity;
  /** 握手 token */
  token: string;
}

export interface AiTaskAssignPayload {
  /** 任务标题 (一句话) */
  title: string;
  /** 任务描述 (Markdown，DeepSeek 的 system prompt) */
  description: string;
  /** 期望的 action */
  action: "execute_command" | "write_file" | "read_file" | "list_directory" | "analyze_and_decide" | "multi_step_plan";
  /** action 参数 */
  params: {
    /** execute_command: shell 命令模板 */
    command?: string;
    /** write_file: 文件路径 + 内容 */
    filePath?: string;
    fileContent?: string;
    /** read_file: 文件路径 */
    readPath?: string;
    /** list_directory: 目录路径 */
    listPath?: string;
    /** 工作目录 */
    workingDir?: string;
    /** 超时 ms */
    timeoutMs?: number;
    /** 是否需要 Claude 审批后才执行 */
    requireApproval?: boolean;
    /** 额外上下文 */
    context?: Record<string, unknown>;
  };
  /** 多步骤计划 */
  steps?: AiTaskStep[];
}

export interface AiTaskStep {
  order: number;
  description: string;
  action: AiTaskAssignPayload["action"];
  params: AiTaskAssignPayload["params"];
  /** 依赖的前置步骤 order */
  dependsOn?: number;
}

export interface AiTaskProgressPayload {
  status: AiTaskStatus;
  /** 进度百分比 0-100 */
  percent?: number;
  /** 当前步骤描述 */
  currentStep?: string;
  /** 实时输出 (shell stdout/stderr) */
  output?: string;
  /** DeepSeek 思考过程 */
  thinking?: string;
}

export interface AiTaskCompletePayload {
  success: boolean;
  /** 结果摘要 */
  summary: string;
  /** 命令 exit code */
  exitCode?: number;
  /** 产生的文件列表 */
  artifacts?: AiArtifact[];
  /** 后续建议 */
  suggestions?: string[];
}

export interface AiStreamChunkPayload {
  /** "stdout" | "stderr" | "thinking" | "log" */
  channel: "stdout" | "stderr" | "thinking" | "log";
  content: string;
  /** 是否为最后一块 */
  isLast: boolean;
}

export interface AiFilePayload {
  action: "read" | "write" | "list" | "delete" | "exists";
  path: string;
  content?: string;
  encoding?: "utf-8" | "base64";
  /** list 结果 */
  entries?: AiFileEntry[];
  exists?: boolean;
  error?: string;
}

export interface AiFileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
}

export interface AiApprovalPayload {
  /** 待审批的操作描述 */
  action: string;
  /** 风险级别 */
  risk: "low" | "medium" | "high";
  /** 影响的文件列表 */
  affectedFiles?: string[];
  /** 审批 ID (ai_approval_res 回传) */
  approvalId: string;
  /** Claude 审批结果 */
  approved?: boolean;
  /** 审批备注 */
  note?: string;
}

export interface AiArtifact {
  path: string;
  type: "file" | "directory" | "output";
  size?: number;
  summary?: string;
}

// ── Agent Configuration ──

export interface DeepSeekConfig {
  /** DeepSeek API endpoint */
  apiUrl: string;
  /** API key */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 最大 token */
  maxTokens?: number;
  /** 温度 */
  temperature?: number;
}

export interface AiOrchestratorConfig {
  /** BridgeServer WebSocket URL (DeepSeek worker 连接) 或控制隧道 (Claude bridge) */
  bridgeUrl: string;
  /** 认证 token */
  authToken: string;
  /** Agent 身份 */
  identity: AgentIdentity;
  /** DeepSeek 配置 (仅 worker 端) */
  deepseek?: DeepSeekConfig;
  /** 工作目录 */
  workingDir?: string;
}
