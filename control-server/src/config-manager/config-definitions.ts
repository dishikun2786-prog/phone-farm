/**
 * PhoneFarm Config Definitions — canonical registry of every configurable key.
 *
 * Organized by category, each entry describes a single config key with its type,
 * default value, validation rules, and scope restrictions.
 *
 * Categories: network, vlm, decision, screenshot, stream, task, ui, system,
 *             security, feature_flags, billing, device, notification, scrcpy, ai_models
 */

export interface ConfigCategorySeed {
  key: string;
  displayName: string;
  description: string;
  icon: string;
  sortOrder: number;
}

export interface ConfigDefinitionSeed {
  categoryKey: string;
  key: string;
  displayName: string;
  description: string;
  valueType: "string" | "number" | "boolean" | "json" | "enum" | "slider" | "color" | "url" | "secret";
  defaultValue: string;
  enumOptions?: { label: string; value: string }[];
  validationRule?: { min?: number; max?: number; step?: number; pattern?: string; required?: boolean };
  isSecret: boolean;
  isOverridable: boolean;
  allowedScopes: string[];
  tags: string[];
  sortOrder: number;
}

export const CATEGORIES: ConfigCategorySeed[] = [
  { key: "network", displayName: "网络通信", description: "WebSocket、HTTP 超时、重连策略", icon: "Wifi", sortOrder: 1 },
  { key: "vlm", displayName: "VLM AI 智能体", description: "视觉语言模型推理参数", icon: "Bot", sortOrder: 2 },
  { key: "decision", displayName: "决策引擎", description: "Edge-Cloud 双模决策路由", icon: "Brain", sortOrder: 3 },
  { key: "screenshot", displayName: "截图采集", description: "截图质量、缩放、编码参数", icon: "Camera", sortOrder: 4 },
  { key: "stream", displayName: "屏幕流转发", description: "scrcpy 视频流编码与传输", icon: "Video", sortOrder: 5 },
  { key: "task", displayName: "任务执行", description: "重试策略、超时保护、并发控制", icon: "ListTodo", sortOrder: 6 },
  { key: "ui", displayName: "UI 交互", description: "浮窗动画、主题、通知样式", icon: "Layout", sortOrder: 7 },
  { key: "system", displayName: "系统管理", description: "缓存清理、内存管理、ANR 监控", icon: "Server", sortOrder: 8 },
  { key: "security", displayName: "安全策略", description: "证书绑定、加密参数、防检测", icon: "Shield", sortOrder: 9 },
  { key: "feature_flags", displayName: "功能开关", description: "特性门控、实验性功能", icon: "Toggle", sortOrder: 10 },
  { key: "billing", displayName: "计费配置", description: "套餐限制、用量阈值", icon: "CreditCard", sortOrder: 11 },
  { key: "device", displayName: "设备管理", description: "心跳间隔、离线检测、注册策略", icon: "Smartphone", sortOrder: 12 },
  { key: "notification", displayName: "通知告警", description: "Webhook、邮件、APP 推送", icon: "Bell", sortOrder: 13 },
  { key: "scrcpy", displayName: "Scrcpy 配置", description: "ADB 屏幕镜像参数", icon: "Monitor", sortOrder: 14 },
  { key: "ai_models", displayName: "AI 模型配置", description: "DeepSeek、QwenVL、本地模型参数", icon: "Cpu", sortOrder: 15 },
  { key: "infrastructure", displayName: "基础设施", description: "NATS、MinIO、Ray、WebRTC 服务配置", icon: "Network", sortOrder: 0 },
  { key: "relay", displayName: "中继服务", description: "Relay/Bridge 服务器超时、缓冲区配置", icon: "Radio", sortOrder: 16 },
];

export const DEFINITIONS: ConfigDefinitionSeed[] = [
  // ═══ NETWORK ═══
  {
    categoryKey: "network", key: "network.okhttp.connect_timeout_ms", displayName: "OkHttp 连接超时",
    description: "TCP 连接建立最大等待时间（毫秒）", valueType: "number", defaultValue: "10000",
    validationRule: { min: 1000, max: 60000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "group", "device"], tags: ["android", "okhttp"], sortOrder: 1,
  },
  {
    categoryKey: "network", key: "network.okhttp.read_timeout_ms", displayName: "OkHttp 读取超时",
    description: "HTTP 响应读取最大等待时间（毫秒）", valueType: "number", defaultValue: "30000",
    validationRule: { min: 1000, max: 120000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "group", "device"], tags: ["android", "okhttp"], sortOrder: 2,
  },
  {
    categoryKey: "network", key: "network.okhttp.write_timeout_ms", displayName: "OkHttp 写入超时",
    description: "HTTP 请求写入最大等待时间（毫秒）", valueType: "number", defaultValue: "30000",
    validationRule: { min: 1000, max: 120000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "group", "device"], tags: ["android", "okhttp"], sortOrder: 3,
  },
  {
    categoryKey: "network", key: "network.ws.heartbeat_interval_ms", displayName: "WebSocket 心跳间隔",
    description: "客户端发送心跳 ping 的间隔（毫秒）", valueType: "number", defaultValue: "30000",
    validationRule: { min: 5000, max: 300000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "group", "device"], tags: ["android", "websocket"], sortOrder: 4,
  },
  {
    categoryKey: "network", key: "network.ws.pong_timeout_ms", displayName: "WebSocket Pong 超时",
    description: "等待服务端 pong 响应的超时（毫秒）", valueType: "number", defaultValue: "10000",
    validationRule: { min: 1000, max: 60000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "group", "device"], tags: ["android", "websocket"], sortOrder: 5,
  },
  {
    categoryKey: "network", key: "network.ws.reconnect_base_delay_ms", displayName: "重连基础延迟",
    description: "WebSocket 断线后首次重连等待（毫秒），后续指数退避", valueType: "number", defaultValue: "1000",
    validationRule: { min: 500, max: 30000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "group", "device"], tags: ["android", "websocket"], sortOrder: 6,
  },
  {
    categoryKey: "network", key: "network.ws.reconnect_max_delay_ms", displayName: "重连最大延迟",
    description: "WebSocket 指数退避上限（毫秒）", valueType: "number", defaultValue: "60000",
    validationRule: { min: 10000, max: 600000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "group", "device"], tags: ["android", "websocket"], sortOrder: 7,
  },
  {
    categoryKey: "network", key: "network.offline_queue.max_items", displayName: "离线队列最大条目",
    description: "断网时本地缓存消息的最大数量", valueType: "number", defaultValue: "500",
    validationRule: { min: 10, max: 10000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "group", "device"], tags: ["android"], sortOrder: 8,
  },

  // ═══ VLM ═══
  {
    categoryKey: "vlm", key: "vlm.max_steps", displayName: "VLM 最大步数",
    description: "单次 VLM 任务的最大推理步数", valueType: "number", defaultValue: "50",
    validationRule: { min: 1, max: 500, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["vlm", "android", "server"], sortOrder: 1,
  },
  {
    categoryKey: "vlm", key: "vlm.temperature", displayName: "VLM 温度参数",
    description: "模型推理的随机性（0=确定性, 1=最大随机）", valueType: "slider", defaultValue: "0.1",
    validationRule: { min: 0, max: 1, step: 0.05, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["vlm", "server"], sortOrder: 2,
  },
  {
    categoryKey: "vlm", key: "vlm.step_timeout_ms", displayName: "VLM 单步超时",
    description: "单步推理的最大等待时间（毫秒）", valueType: "number", defaultValue: "30000",
    validationRule: { min: 5000, max: 120000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["vlm", "server"], sortOrder: 3,
  },
  {
    categoryKey: "vlm", key: "vlm.model_name", displayName: "默认 VLM 模型",
    description: "VLM 推理使用的默认模型名称", valueType: "enum", defaultValue: "autoglm-phone-9b",
    enumOptions: [
      { label: "AutoGLM-Phone 9B", value: "autoglm-phone-9b" },
      { label: "UI-TARS", value: "ui-tars" },
      { label: "Qwen2.5-VL 7B", value: "qwen2.5-vl-7b" },
      { label: "MAI-UI", value: "mai-ui" },
      { label: "GUI-Owl", value: "gui-owl" },
    ],
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["vlm", "server"], sortOrder: 4,
  },

  // ═══ DECISION ═══
  {
    categoryKey: "decision", key: "decision.confidence_threshold", displayName: "决策置信度阈值",
    description: "低于此阈值的决策将触发人工确认或 QwenVL 回退", valueType: "slider", defaultValue: "0.7",
    validationRule: { min: 0.1, max: 1, step: 0.05, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["decision", "server"], sortOrder: 1,
  },
  {
    categoryKey: "decision", key: "decision.max_consecutive_failures", displayName: "最大连续失败次数",
    description: "连续失败超过此次数后暂停任务", valueType: "number", defaultValue: "3",
    validationRule: { min: 1, max: 20, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["decision", "server"], sortOrder: 2,
  },
  {
    categoryKey: "decision", key: "decision.max_low_confidence", displayName: "最大低置信度次数",
    description: "连续低置信度决策超过此次数后暂停", valueType: "number", defaultValue: "3",
    validationRule: { min: 1, max: 20, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["decision", "server"], sortOrder: 3,
  },
  {
    categoryKey: "decision", key: "decision.edge_state_ttl_sec", displayName: "边缘状态 TTL",
    description: "边缘上传的状态数据缓存过期时间（秒）", valueType: "number", defaultValue: "300",
    validationRule: { min: 30, max: 3600, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["decision", "server"], sortOrder: 4,
  },

  // ═══ SCREENSHOT ═══
  {
    categoryKey: "screenshot", key: "screenshot.quality", displayName: "JPEG 截图质量",
    description: "截图 JPEG 编码质量 (0-100)", valueType: "slider", defaultValue: "80",
    validationRule: { min: 10, max: 100, step: 5, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 1,
  },
  {
    categoryKey: "screenshot", key: "screenshot.scale", displayName: "截图缩放比例",
    description: "截图尺寸缩放因子 (0.1-1.0)", valueType: "slider", defaultValue: "0.5",
    validationRule: { min: 0.1, max: 1, step: 0.1, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 2,
  },
  {
    categoryKey: "screenshot", key: "screenshot.format", displayName: "截图格式",
    description: "截图编码格式", valueType: "enum", defaultValue: "jpeg",
    enumOptions: [
      { label: "JPEG", value: "jpeg" },
      { label: "PNG", value: "png" },
      { label: "WebP", value: "webp" },
    ],
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 3,
  },
  {
    categoryKey: "screenshot", key: "screenshot.max_width", displayName: "截图最大宽度",
    description: "截图缩放目标最大宽度（像素）", valueType: "number", defaultValue: "720",
    validationRule: { min: 240, max: 1440, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 4,
  },

  // ═══ STREAM ═══
  {
    categoryKey: "stream", key: "stream.idle_timeout_sec", displayName: "流空闲超时",
    description: "屏幕流无操作后自动关闭时间（秒）", valueType: "number", defaultValue: "300",
    validationRule: { min: 30, max: 3600, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["stream", "server"], sortOrder: 1,
  },
  {
    categoryKey: "stream", key: "stream.max_duration_sec", displayName: "流最大时长",
    description: "单次屏幕流最长持续时间（秒）", valueType: "number", defaultValue: "1800",
    validationRule: { min: 60, max: 86400, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["stream", "server"], sortOrder: 2,
  },
  {
    categoryKey: "stream", key: "stream.encoder.max_size", displayName: "编码最大分辨率",
    description: "视频编码目标最大边（像素）", valueType: "number", defaultValue: "1080",
    validationRule: { min: 360, max: 2160, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["stream", "android"], sortOrder: 3,
  },
  {
    categoryKey: "stream", key: "stream.encoder.bitrate_wifi", displayName: "WiFi 码率",
    description: "WiFi 网络下屏幕流码率（bps）", valueType: "number", defaultValue: "4000000",
    validationRule: { min: 500000, max: 20000000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["stream", "android"], sortOrder: 4,
  },
  {
    categoryKey: "stream", key: "stream.encoder.bitrate_5g", displayName: "5G 码率",
    description: "5G 网络下屏幕流码率（bps）", valueType: "number", defaultValue: "3000000",
    validationRule: { min: 500000, max: 20000000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["stream", "android"], sortOrder: 5,
  },
  {
    categoryKey: "stream", key: "stream.encoder.bitrate_4g", displayName: "4G 码率",
    description: "4G 网络下屏幕流码率（bps）", valueType: "number", defaultValue: "1500000",
    validationRule: { min: 500000, max: 10000000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["stream", "android"], sortOrder: 6,
  },
  {
    categoryKey: "stream", key: "stream.encoder.bitrate_3g", displayName: "3G/低速 码率",
    description: "3G 或低速网络下屏幕流码率（bps）", valueType: "number", defaultValue: "800000",
    validationRule: { min: 100000, max: 5000000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["stream", "android"], sortOrder: 7,
  },
  {
    categoryKey: "stream", key: "stream.encoder.max_fps", displayName: "最大帧率",
    description: "屏幕流编码最大帧率", valueType: "number", defaultValue: "15",
    validationRule: { min: 1, max: 60, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["stream", "android"], sortOrder: 8,
  },

  // ═══ TASK ═══
  {
    categoryKey: "task", key: "task.retry.max_attempts", displayName: "任务最大重试次数",
    description: "任务失败后自动重试的最大次数", valueType: "number", defaultValue: "3",
    validationRule: { min: 0, max: 20, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 1,
  },
  {
    categoryKey: "task", key: "task.retry.base_delay_ms", displayName: "重试基础延迟",
    description: "任务重试基础等待时间（毫秒）", valueType: "number", defaultValue: "5000",
    validationRule: { min: 1000, max: 300000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 2,
  },
  {
    categoryKey: "task", key: "task.timeout.default_ms", displayName: "任务默认超时",
    description: "单个任务默认执行超时（毫秒）", valueType: "number", defaultValue: "600000",
    validationRule: { min: 60000, max: 86400000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 3,
  },
  {
    categoryKey: "task", key: "task.concurrency.max_per_device", displayName: "单设备最大并发任务",
    description: "一台设备同时执行的任务数上限", valueType: "number", defaultValue: "3",
    validationRule: { min: 1, max: 20, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 4,
  },
  {
    categoryKey: "task", key: "task.edge_loop.cycle_interval_ms", displayName: "边缘循环间隔",
    description: "EdgeLoop 感知→执行的主循环间隔（毫秒）", valueType: "number", defaultValue: "500",
    validationRule: { min: 100, max: 10000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android", "edge"], sortOrder: 5,
  },

  // ═══ UI ═══
  {
    categoryKey: "ui", key: "ui.floating.bubble_size_dp", displayName: "浮窗气泡尺寸",
    description: "浮窗气泡直径（dp）", valueType: "number", defaultValue: "56",
    validationRule: { min: 32, max: 96, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android", "floating"], sortOrder: 1,
  },
  {
    categoryKey: "ui", key: "ui.floating.expanded_width_dp", displayName: "浮窗展开宽度",
    description: "浮窗展开面板宽度（dp）", valueType: "number", defaultValue: "280",
    validationRule: { min: 200, max: 500, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android", "floating"], sortOrder: 2,
  },
  {
    categoryKey: "ui", key: "ui.floating.expanded_height_dp", displayName: "浮窗展开高度",
    description: "浮窗展开面板高度（dp）", valueType: "number", defaultValue: "400",
    validationRule: { min: 200, max: 800, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android", "floating"], sortOrder: 3,
  },
  {
    categoryKey: "ui", key: "ui.animation.duration_ms", displayName: "动画时长",
    description: "UI 过渡动画默认时长（毫秒）", valueType: "number", defaultValue: "300",
    validationRule: { min: 50, max: 2000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 4,
  },
  {
    categoryKey: "ui", key: "ui.theme.dark_mode", displayName: "深色模式",
    description: "全局深色主题开关", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 5,
  },
  {
    categoryKey: "ui", key: "ui.glass_effect.enabled", displayName: "毛玻璃效果",
    description: "是否启用毛玻璃背景效果", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 6,
  },

  // ═══ SYSTEM ═══
  {
    categoryKey: "system", key: "system.cache.max_size_mb", displayName: "缓存上限",
    description: "APP 缓存最大占用（MB）", valueType: "number", defaultValue: "200",
    validationRule: { min: 10, max: 2000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 1,
  },
  {
    categoryKey: "system", key: "system.cache.cleanup_interval_hours", displayName: "缓存清理间隔",
    description: "自动清理缓存的时间间隔（小时）", valueType: "number", defaultValue: "24",
    validationRule: { min: 1, max: 720, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 2,
  },
  {
    categoryKey: "system", key: "system.anr.watchdog_timeout_ms", displayName: "ANR 看门狗超时",
    description: "主线程卡顿检测阈值（毫秒）", valueType: "number", defaultValue: "3000",
    validationRule: { min: 500, max: 10000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 3,
  },
  {
    categoryKey: "system", key: "system.memory.low_threshold_mb", displayName: "低内存阈值",
    description: "可用内存低于此值触发清理（MB）", valueType: "number", defaultValue: "128",
    validationRule: { min: 32, max: 1024, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android"], sortOrder: 4,
  },
  {
    categoryKey: "system", key: "system.emulator.detection_enabled", displayName: "模拟器检测",
    description: "是否启用模拟器/虚拟环境检测", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["android", "security"], sortOrder: 5,
  },

  // ═══ SECURITY ═══
  {
    categoryKey: "security", key: "security.certificate_pinning.enabled", displayName: "证书绑定",
    description: "是否启用 TLS 证书绑定验证", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["android", "security"], sortOrder: 1,
  },
  {
    categoryKey: "security", key: "security.message_encryption.enabled", displayName: "消息加密",
    description: "是否启用 AES-256-GCM 载荷加密", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["android", "security"], sortOrder: 2,
  },
  {
    categoryKey: "security", key: "security.traffic_obfuscation.enabled", displayName: "流量混淆",
    description: "是否启用 WebSocket 流量混淆", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["android", "security"], sortOrder: 3,
  },
  {
    categoryKey: "security", key: "security.device_integrity.check_enabled", displayName: "设备完整性检查",
    description: "是否在启动时验证 APK 签名和设备完整性", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["android", "security"], sortOrder: 4,
  },

  // ═══ FEATURE FLAGS ═══
  {
    categoryKey: "feature_flags", key: "ff.decision_engine", displayName: "决策引擎",
    description: "启用 Edge-Cloud 双模决策引擎", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server"], sortOrder: 1,
  },
  {
    categoryKey: "feature_flags", key: "ff.qwen_vl_fallback", displayName: "QwenVL 回退",
    description: "DeepSeek 低置信度时回退到 QwenVL 视觉模型", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server"], sortOrder: 2,
  },
  {
    categoryKey: "feature_flags", key: "ff.stream_on_demand", displayName: "按需屏幕流",
    description: "仅在有前端订阅时才推送屏幕流", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server"], sortOrder: 3,
  },
  {
    categoryKey: "feature_flags", key: "ff.cross_device_memory", displayName: "跨设备记忆",
    description: "启用跨设备经验共享和记忆同步", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server"], sortOrder: 4,
  },
  {
    categoryKey: "feature_flags", key: "ff.legacy_vlm", displayName: "兼容旧版 VLM",
    description: "保留旧版 VLM Agent 路由（过渡期）", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server"], sortOrder: 5,
  },
  {
    categoryKey: "feature_flags", key: "ff.local_vlm_inference", displayName: "本地 VLM 推理",
    description: "允许设备使用 llama.cpp 本地模型推理", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android", "server"], sortOrder: 6,
  },

  // ═══ BILLING ═══
  {
    categoryKey: "billing", key: "billing.free.max_devices", displayName: "免费版最大设备数",
    description: "免费套餐允许注册的最大设备数量", valueType: "number", defaultValue: "1",
    validationRule: { min: 1, max: 1000, required: true },
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server"], sortOrder: 1,
  },
  {
    categoryKey: "billing", key: "billing.free.max_vlm_calls_per_day", displayName: "免费版每日 VLM 调用",
    description: "免费套餐每日 VLM 推理次数上限", valueType: "number", defaultValue: "100",
    validationRule: { min: 0, max: 100000, required: true },
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server"], sortOrder: 2,
  },

  // ═══ DEVICE ═══
  {
    categoryKey: "device", key: "device.heartbeat.interval_ms", displayName: "设备心跳间隔",
    description: "设备向服务端发送心跳的间隔（毫秒）", valueType: "number", defaultValue: "15000",
    validationRule: { min: 5000, max: 120000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["android", "server"], sortOrder: 1,
  },
  {
    categoryKey: "device", key: "device.offline.timeout_ms", displayName: "离线判定超时",
    description: "超过此时间未收到心跳视为离线（毫秒）", valueType: "number", defaultValue: "45000",
    validationRule: { min: 10000, max: 600000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server"], sortOrder: 2,
  },

  // ═══ NOTIFICATION ═══
  {
    categoryKey: "notification", key: "notification.webhook.retry_count", displayName: "Webhook 重试次数",
    description: "Webhook 发送失败后的最大重试次数", valueType: "number", defaultValue: "3",
    validationRule: { min: 0, max: 10, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server"], sortOrder: 1,
  },
  {
    categoryKey: "notification", key: "notification.alert.throttle_seconds", displayName: "告警节流间隔",
    description: "同类型告警的最小发送间隔（秒）", valueType: "number", defaultValue: "300",
    validationRule: { min: 30, max: 86400, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server"], sortOrder: 2,
  },

  // ═══ SCRCPY ═══
  {
    categoryKey: "scrcpy", key: "scrcpy.max_size", displayName: "Scrcpy 最大分辨率",
    description: "ADB 屏幕镜像目标最大边（像素）", valueType: "number", defaultValue: "1080",
    validationRule: { min: 360, max: 2160, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["server"], sortOrder: 1,
  },
  {
    categoryKey: "scrcpy", key: "scrcpy.bit_rate", displayName: "Scrcpy 码率",
    description: "ADB 屏幕镜像视频码率（bps）", valueType: "number", defaultValue: "4000000",
    validationRule: { min: 500000, max: 20000000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["server"], sortOrder: 2,
  },
  {
    categoryKey: "scrcpy", key: "scrcpy.max_fps", displayName: "Scrcpy 最大帧率",
    description: "ADB 屏幕镜像最大帧率", valueType: "number", defaultValue: "30",
    validationRule: { min: 1, max: 60, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["server"], sortOrder: 3,
  },

  // ═══ AI MODELS ═══
  {
    categoryKey: "ai_models", key: "ai.deepseek.api_url", displayName: "DeepSeek API URL",
    description: "DeepSeek API 端点地址", valueType: "url", defaultValue: "https://api.deepseek.com/anthropic/messages",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "deepseek"], sortOrder: 1,
  },
  {
    categoryKey: "ai_models", key: "ai.deepseek.api_key", displayName: "DeepSeek API Key",
    description: "DeepSeek API 认证密钥", valueType: "secret", defaultValue: "",
    validationRule: { required: false },
    isSecret: true, isOverridable: false, allowedScopes: ["global"], tags: ["server", "deepseek"], sortOrder: 2,
  },
  {
    categoryKey: "ai_models", key: "ai.deepseek.model", displayName: "DeepSeek 模型",
    description: "DeepSeek 使用的模型名称", valueType: "enum", defaultValue: "deepseek-v4-flash",
    enumOptions: [
      { label: "DeepSeek-V4-Flash (推荐)", value: "deepseek-v4-flash" },
      { label: "DeepSeek-Chat (V4)", value: "deepseek-chat" },
      { label: "DeepSeek-Reasoner", value: "deepseek-reasoner" },
    ],
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "deepseek"], sortOrder: 3,
  },
  {
    categoryKey: "ai_models", key: "ai.deepseek.max_tokens", displayName: "DeepSeek 最大 Token",
    description: "DeepSeek 单次响应最大 Token 数", valueType: "number", defaultValue: "512",
    validationRule: { min: 64, max: 8192, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "deepseek"], sortOrder: 4,
  },
  {
    categoryKey: "ai_models", key: "ai.deepseek.temperature", displayName: "DeepSeek 温度",
    description: "DeepSeek 推理温度参数", valueType: "slider", defaultValue: "0.1",
    validationRule: { min: 0, max: 1, step: 0.05, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "deepseek"], sortOrder: 5,
  },
  {
    categoryKey: "ai_models", key: "ai.qwen_vl.api_url", displayName: "QwenVL API URL",
    description: "阿里云百炼 DashScope API 端点", valueType: "url", defaultValue: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "qwenvl"], sortOrder: 6,
  },
  {
    categoryKey: "ai_models", key: "ai.qwen_vl.api_key", displayName: "QwenVL API Key",
    description: "DashScope API 认证密钥", valueType: "secret", defaultValue: "",
    validationRule: { required: false },
    isSecret: true, isOverridable: false, allowedScopes: ["global"], tags: ["server", "qwenvl"], sortOrder: 7,
  },
  {
    categoryKey: "ai_models", key: "ai.qwen_vl.model", displayName: "QwenVL 模型",
    description: "QwenVL 视觉模型名称", valueType: "enum", defaultValue: "qwen3-vl-plus",
    enumOptions: [
      { label: "Qwen3-VL-Plus (推荐)", value: "qwen3-vl-plus" },
      { label: "Qwen3-VL-Flash", value: "qwen3-vl-flash" },
      { label: "Qwen3-VL-Max", value: "qwen3-vl-max" },
      { label: "Qwen2.5-VL-72B", value: "qwen2.5-vl-72b" },
      { label: "Qwen2.5-VL-7B", value: "qwen2.5-vl-7b" },
    ],
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "qwenvl"], sortOrder: 8,
  },
  {
    categoryKey: "ai_models", key: "ai.qwen_vl.max_tokens", displayName: "QwenVL 最大 Token",
    description: "QwenVL 单次响应最大 Token 数", valueType: "number", defaultValue: "1024",
    validationRule: { min: 64, max: 8192, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "qwenvl"], sortOrder: 9,
  },
  {
    categoryKey: "ai_models", key: "ai.qwen_vl.temperature", displayName: "QwenVL 温度",
    description: "QwenVL 推理温度参数", valueType: "slider", defaultValue: "0.1",
    validationRule: { min: 0, max: 1, step: 0.05, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "qwenvl"], sortOrder: 10,
  },

  // ═══ EXPERIENCE COMPILER ═══
  {
    categoryKey: "decision", key: "decision.experience.compile_interval_min", displayName: "经验编译间隔",
    description: "跨设备经验编译的触发间隔（分钟）", valueType: "number", defaultValue: "30",
    validationRule: { min: 5, max: 1440, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "decision"], sortOrder: 5,
  },
  {
    categoryKey: "decision", key: "decision.experience.min_devices", displayName: "经验编译最小设备数",
    description: "触发经验编译所需的最小在线设备数", valueType: "number", defaultValue: "3",
    validationRule: { min: 1, max: 100, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "decision"], sortOrder: 6,
  },

  // ═══ LOCAL VLM ═══
  {
    categoryKey: "vlm", key: "vlm.local.llama_threads", displayName: "本地推理线程数",
    description: "llama.cpp 本地推理使用的 CPU 线程数", valueType: "number", defaultValue: "4",
    validationRule: { min: 1, max: 16, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android", "vlm", "local"], sortOrder: 10,
  },
  {
    categoryKey: "vlm", key: "vlm.local.gpu_layers", displayName: "GPU 加速层数",
    description: "llama.cpp 卸载到 GPU 的层数（-1=全部）", valueType: "number", defaultValue: "-1",
    validationRule: { min: -1, max: 100, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["android", "vlm", "local"], sortOrder: 11,
  },

  // ═══ INFRASTRUCTURE — NATS ═══
  {
    categoryKey: "infrastructure", key: "infra.nats.url", displayName: "NATS URL",
    description: "NATS 服务器连接地址", valueType: "url", defaultValue: "nats://localhost:4222",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "nats"], sortOrder: 1,
  },
  {
    categoryKey: "infrastructure", key: "infra.nats.token", displayName: "NATS Token",
    description: "NATS 认证 Token", valueType: "secret", defaultValue: "",
    isSecret: true, isOverridable: false, allowedScopes: ["global"], tags: ["server", "nats"], sortOrder: 2,
  },
  {
    categoryKey: "infrastructure", key: "infra.nats.enabled", displayName: "NATS 启用",
    description: "是否启用 NATS 状态同步", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "nats"], sortOrder: 3,
  },
  {
    categoryKey: "infrastructure", key: "infra.nats.reconnect_wait_ms", displayName: "NATS 重连等待",
    description: "NATS 断线重连等待时间（毫秒）", valueType: "number", defaultValue: "2000",
    validationRule: { min: 100, max: 30000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "nats"], sortOrder: 4,
  },
  {
    categoryKey: "infrastructure", key: "infra.nats.max_bytes", displayName: "NATS JetStream 最大存储",
    description: "JetStream Stream 最大存储字节数", valueType: "number", defaultValue: "1073741824",
    validationRule: { min: 1048576, max: 107374182400, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "nats"], sortOrder: 5,
  },

  // ═══ INFRASTRUCTURE — MinIO ═══
  {
    categoryKey: "infrastructure", key: "infra.minio.endpoint", displayName: "MinIO Endpoint",
    description: "MinIO 服务器地址（host:port）", valueType: "string", defaultValue: "localhost:9000",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "minio"], sortOrder: 6,
  },
  {
    categoryKey: "infrastructure", key: "infra.minio.access_key", displayName: "MinIO Access Key",
    description: "MinIO 访问密钥", valueType: "secret", defaultValue: "minioadmin",
    isSecret: true, isOverridable: false, allowedScopes: ["global"], tags: ["server", "minio"], sortOrder: 7,
  },
  {
    categoryKey: "infrastructure", key: "infra.minio.secret_key", displayName: "MinIO Secret Key",
    description: "MinIO 秘密密钥", valueType: "secret", defaultValue: "minioadmin",
    isSecret: true, isOverridable: false, allowedScopes: ["global"], tags: ["server", "minio"], sortOrder: 8,
  },
  {
    categoryKey: "infrastructure", key: "infra.minio.bucket", displayName: "MinIO Bucket",
    description: "MinIO 默认存储桶名称", valueType: "string", defaultValue: "phonefarm",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "minio"], sortOrder: 9,
  },
  {
    categoryKey: "infrastructure", key: "infra.minio.use_ssl", displayName: "MinIO SSL",
    description: "MinIO 连接是否使用 HTTPS", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "minio"], sortOrder: 10,
  },
  {
    categoryKey: "infrastructure", key: "infra.minio.enabled", displayName: "MinIO 启用",
    description: "是否启用 MinIO 对象存储", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "minio"], sortOrder: 11,
  },

  // ═══ INFRASTRUCTURE — Ray ═══
  {
    categoryKey: "infrastructure", key: "infra.ray.address", displayName: "Ray Dashboard 地址",
    description: "Ray Dashboard HTTP API 地址", valueType: "url", defaultValue: "http://localhost:8265",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "ray"], sortOrder: 12,
  },
  {
    categoryKey: "infrastructure", key: "infra.ray.enabled", displayName: "Ray 启用",
    description: "是否启用 Ray 分布式任务调度", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ray"], sortOrder: 13,
  },
  {
    categoryKey: "infrastructure", key: "infra.ray.retry_max_attempts", displayName: "Ray 重试次数",
    description: "Ray API 请求最大重试次数", valueType: "number", defaultValue: "3",
    validationRule: { min: 0, max: 10, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ray"], sortOrder: 14,
  },
  {
    categoryKey: "infrastructure", key: "infra.ray.retry_base_delay_ms", displayName: "Ray 重试基础延迟",
    description: "Ray 重试指数退避基础延迟（毫秒）", valueType: "number", defaultValue: "1000",
    validationRule: { min: 100, max: 30000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ray"], sortOrder: 15,
  },
  {
    categoryKey: "infrastructure", key: "infra.ray.task_timeout_ms", displayName: "Ray 任务超时",
    description: "Ray 任务默认超时时间（毫秒）", valueType: "number", defaultValue: "300000",
    validationRule: { min: 10000, max: 3600000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ray"], sortOrder: 16,
  },
  {
    categoryKey: "infrastructure", key: "infra.ray.poll_interval_ms", displayName: "Ray 轮询间隔",
    description: "Ray 任务状态轮询间隔（毫秒）", valueType: "number", defaultValue: "1000",
    validationRule: { min: 100, max: 10000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ray"], sortOrder: 17,
  },
  {
    categoryKey: "infrastructure", key: "infra.ray.request_timeout_ms", displayName: "Ray 请求超时",
    description: "Ray 单次 HTTP 请求超时（毫秒）", valueType: "number", defaultValue: "30000",
    validationRule: { min: 1000, max: 120000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ray"], sortOrder: 18,
  },

  // ═══ INFRASTRUCTURE — WebRTC ═══
  {
    categoryKey: "infrastructure", key: "infra.webrtc.turn_server", displayName: "TURN 服务器地址",
    description: "WebRTC TURN 服务器 URL", valueType: "url", defaultValue: "turn:localhost:3478",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "webrtc"], sortOrder: 19,
  },
  {
    categoryKey: "infrastructure", key: "infra.webrtc.turn_username", displayName: "TURN 用户名",
    description: "TURN 服务器认证用户名", valueType: "string", defaultValue: "phonefarm",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "webrtc"], sortOrder: 20,
  },
  {
    categoryKey: "infrastructure", key: "infra.webrtc.turn_credential", displayName: "TURN 密码",
    description: "TURN 服务器认证密码", valueType: "secret", defaultValue: "",
    isSecret: true, isOverridable: false, allowedScopes: ["global"], tags: ["server", "webrtc"], sortOrder: 21,
  },
  {
    categoryKey: "infrastructure", key: "infra.webrtc.stun_server", displayName: "STUN 服务器地址",
    description: "WebRTC STUN 服务器 URL", valueType: "url", defaultValue: "stun:stun.l.google.com:19302",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "webrtc"], sortOrder: 22,
  },
  {
    categoryKey: "infrastructure", key: "infra.webrtc.enabled", displayName: "WebRTC 启用",
    description: "是否启用 WebRTC P2P 通信", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "webrtc"], sortOrder: 23,
  },

  // ═══ INFRASTRUCTURE — Edge Node ═══
  {
    categoryKey: "infrastructure", key: "infra.edge_node.enabled", displayName: "边缘节点启用",
    description: "是否启用 Go 边缘节点服务", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "edge"], sortOrder: 24,
  },
  {
    categoryKey: "infrastructure", key: "infra.edge_node.port", displayName: "边缘节点端口",
    description: "Go 边缘节点 HTTP 服务端口", valueType: "number", defaultValue: "9090",
    validationRule: { min: 1024, max: 65535, required: true },
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "edge"], sortOrder: 25,
  },

  // ═══ PHASE 2-5 FEATURE FLAGS ═══
  {
    categoryKey: "feature_flags", key: "ff.webrtc_p2p", displayName: "WebRTC P2P",
    description: "启用 WebRTC P2P 屏幕镜像与 DataChannel 控制", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server"], sortOrder: 7,
  },
  {
    categoryKey: "feature_flags", key: "ff.nats_sync", displayName: "NATS 状态同步",
    description: "使用 NATS JetStream 替代 WebSocket 广播进行设备状态同步", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server"], sortOrder: 8,
  },
  {
    categoryKey: "feature_flags", key: "ff.ray_scheduler", displayName: "Ray AI 调度",
    description: "启用 Ray 分布式 AI 任务调度", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server"], sortOrder: 9,
  },
  {
    categoryKey: "feature_flags", key: "ff.federated_learning", displayName: "联邦学习",
    description: "启用跨设备联邦学习模型聚合", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server"], sortOrder: 10,
  },
  {
    categoryKey: "feature_flags", key: "ff.p2p_group_control", displayName: "P2P 群控",
    description: "启用设备间直连 P2P 群控同步", valueType: "boolean", defaultValue: "false",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server"], sortOrder: 11,
  },
  {
    categoryKey: "feature_flags", key: "ff.model_hot_update", displayName: "模型热更新",
    description: "允许不重发 APK 即可动态更新 AI 模型文件", valueType: "boolean", defaultValue: "true",
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "android"], sortOrder: 12,
  },

  // ═══ LEGACY VLM ═══
  {
    categoryKey: "vlm", key: "vlm.legacy.api_url", displayName: "旧版 VLM API URL",
    description: "旧版 VLM Agent API 端点", valueType: "url", defaultValue: "http://localhost:5000/api/vlm/execute",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "vlm"], sortOrder: 12,
  },
  {
    categoryKey: "vlm", key: "vlm.legacy.model_name", displayName: "旧版 VLM 模型名",
    description: "旧版 VLM 使用的模型名称", valueType: "string", defaultValue: "autoglm-phone-9b",
    isSecret: false, isOverridable: false, allowedScopes: ["global"], tags: ["server", "vlm"], sortOrder: 13,
  },
  {
    categoryKey: "vlm", key: "vlm.trace_dir", displayName: "VLM Trace 目录",
    description: "VLM 执行轨迹文件存储目录", valueType: "string", defaultValue: "data/episodes",
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "vlm"], sortOrder: 14,
  },

  // ═══ RELAY ═══
  {
    categoryKey: "relay", key: "relay.idle_timeout_ms", displayName: "Relay 空闲超时",
    description: "Relay 连接空闲自动断开时间（毫秒）", valueType: "number", defaultValue: "300000",
    validationRule: { min: 10000, max: 3600000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "relay"], sortOrder: 1,
  },
  {
    categoryKey: "relay", key: "relay.sweep_interval_ms", displayName: "Relay 清扫间隔",
    description: "Relay 过期连接清扫间隔（毫秒）", valueType: "number", defaultValue: "30000",
    validationRule: { min: 5000, max: 300000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "relay"], sortOrder: 2,
  },
  {
    categoryKey: "relay", key: "relay.max_payload_bytes", displayName: "Relay 最大载荷",
    description: "Relay 单次消息最大字节数", valueType: "number", defaultValue: "16777216",
    validationRule: { min: 1048576, max: 104857600, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "relay"], sortOrder: 3,
  },

  // ═══ BRIDGE ═══
  {
    categoryKey: "relay", key: "bridge.idle_timeout_ms", displayName: "Bridge 空闲超时",
    description: "VPS Bridge 连接空闲超时（毫秒）", valueType: "number", defaultValue: "300000",
    validationRule: { min: 10000, max: 3600000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "bridge"], sortOrder: 4,
  },
  {
    categoryKey: "relay", key: "bridge.sweep_interval_ms", displayName: "Bridge 清扫间隔",
    description: "Bridge 过期连接清扫间隔（毫秒）", valueType: "number", defaultValue: "30000",
    validationRule: { min: 5000, max: 300000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "bridge"], sortOrder: 5,
  },
  {
    categoryKey: "relay", key: "bridge.auth_timeout_ms", displayName: "Bridge 认证超时",
    description: "Bridge 设备认证等待超时（毫秒）", valueType: "number", defaultValue: "10000",
    validationRule: { min: 1000, max: 60000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "bridge"], sortOrder: 6,
  },

  // ═══ STORAGE LIFECYCLE ═══
  {
    categoryKey: "infrastructure", key: "storage.screenshots.retention_days", displayName: "截图保留天数",
    description: "截图文件在 MinIO 中的保留天数", valueType: "number", defaultValue: "7",
    validationRule: { min: 1, max: 365, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "minio"], sortOrder: 26,
  },
  {
    categoryKey: "infrastructure", key: "storage.logs.retention_days", displayName: "日志保留天数",
    description: "设备日志在 MinIO 中的保留天数", valueType: "number", defaultValue: "30",
    validationRule: { min: 1, max: 365, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "minio"], sortOrder: 27,
  },
  {
    categoryKey: "infrastructure", key: "storage.models.keep_versions", displayName: "模型保留版本数",
    description: "每个模型类型保留的最新版本数量", valueType: "number", defaultValue: "3",
    validationRule: { min: 1, max: 20, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "minio"], sortOrder: 28,
  },
  {
    categoryKey: "infrastructure", key: "storage.default_expiry_seconds", displayName: "签名URL默认过期",
    description: "MinIO 预签名 URL 默认有效时间（秒）", valueType: "number", defaultValue: "3600",
    validationRule: { min: 60, max: 86400, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "minio"], sortOrder: 29,
  },

  // ═══ HARD-CODED CONSTANTS — Decision Engine ═══
  {
    categoryKey: "decision", key: "decision.safety.action_history_max", displayName: "安全动作历史上限",
    description: "安全守卫保留的最近动作历史数量", valueType: "number", defaultValue: "20",
    validationRule: { min: 5, max: 200, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "decision"], sortOrder: 7,
  },
  {
    categoryKey: "decision", key: "decision.safety.dedup_window_ms", displayName: "去重窗口",
    description: "安全守卫操作去重时间窗口（毫秒）", valueType: "number", defaultValue: "10000",
    validationRule: { min: 1000, max: 60000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "decision"], sortOrder: 8,
  },
  {
    categoryKey: "decision", key: "decision.safety.max_input_text_len", displayName: "输入文本最大长度",
    description: "安全守卫检查的输入文本最大长度", valueType: "number", defaultValue: "500",
    validationRule: { min: 50, max: 5000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "decision"], sortOrder: 9,
  },

  // ═══ HARD-CODED CONSTANTS — AI Model Retry/Timeout ═══
  {
    categoryKey: "ai_models", key: "ai.deepseek.retry_max_attempts", displayName: "DeepSeek 重试次数",
    description: "DeepSeek API 请求失败最大重试次数", valueType: "number", defaultValue: "3",
    validationRule: { min: 0, max: 10, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "deepseek"], sortOrder: 11,
  },
  {
    categoryKey: "ai_models", key: "ai.deepseek.request_timeout_ms", displayName: "DeepSeek 请求超时",
    description: "DeepSeek 单次 API 请求超时（毫秒）", valueType: "number", defaultValue: "10000",
    validationRule: { min: 1000, max: 60000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "deepseek"], sortOrder: 12,
  },
  {
    categoryKey: "ai_models", key: "ai.deepseek.retry_base_delay_ms", displayName: "DeepSeek 重试延迟",
    description: "DeepSeek 重试指数退避基础延迟（毫秒）", valueType: "number", defaultValue: "1000",
    validationRule: { min: 100, max: 30000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "deepseek"], sortOrder: 13,
  },
  {
    categoryKey: "ai_models", key: "ai.qwen_vl.retry_max_attempts", displayName: "QwenVL 重试次数",
    description: "QwenVL API 请求失败最大重试次数", valueType: "number", defaultValue: "3",
    validationRule: { min: 0, max: 10, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "qwenvl"], sortOrder: 14,
  },
  {
    categoryKey: "ai_models", key: "ai.qwen_vl.request_timeout_ms", displayName: "QwenVL 请求超时",
    description: "QwenVL 单次 API 请求超时（毫秒）", valueType: "number", defaultValue: "15000",
    validationRule: { min: 1000, max: 60000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group"], tags: ["server", "qwenvl"], sortOrder: 15,
  },
  {
    categoryKey: "ai_models", key: "ai.qwen_vl.retry_base_delay_ms", displayName: "QwenVL 重试延迟",
    description: "QwenVL 重试指数退避基础延迟（毫秒）", valueType: "number", defaultValue: "2000",
    validationRule: { min: 100, max: 30000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "qwenvl"], sortOrder: 16,
  },

  // ═══ HARD-CODED CONSTANTS — Task Queue ═══
  {
    categoryKey: "task", key: "task.queue.max_retries", displayName: "队列最大重试",
    description: "BullMQ 任务队列最大重试次数", valueType: "number", defaultValue: "3",
    validationRule: { min: 0, max: 20, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "bullmq"], sortOrder: 6,
  },
  {
    categoryKey: "task", key: "task.timeout.ws_hub_ms", displayName: "WS Hub 任务超时",
    description: "WebSocket Hub 中任务执行最大等待时间（毫秒）", valueType: "number", defaultValue: "1800000",
    validationRule: { min: 60000, max: 86400000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server"], sortOrder: 7,
  },

  // ═══ HARD-CODED CONSTANTS — Webhook ═══
  {
    categoryKey: "notification", key: "webhook.retry_max_attempts", displayName: "Webhook 最大重试",
    description: "Webhook 发送失败最大重试次数", valueType: "number", defaultValue: "3",
    validationRule: { min: 0, max: 10, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "webhook"], sortOrder: 3,
  },
  {
    categoryKey: "notification", key: "webhook.retry_base_delay_ms", displayName: "Webhook 重试延迟",
    description: "Webhook 重试基础延迟（毫秒）", valueType: "number", defaultValue: "2000",
    validationRule: { min: 500, max: 30000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "webhook"], sortOrder: 4,
  },
  {
    categoryKey: "notification", key: "webhook.request_timeout_ms", displayName: "Webhook 请求超时",
    description: "Webhook 单次请求超时（毫秒）", valueType: "number", defaultValue: "10000",
    validationRule: { min: 1000, max: 60000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "webhook"], sortOrder: 5,
  },

  // ═══ HARD-CODED CONSTANTS — Alerts ═══
  {
    categoryKey: "notification", key: "alert.evaluation_interval_ms", displayName: "告警评估间隔",
    description: "告警规则评估周期（毫秒）", valueType: "number", defaultValue: "30000",
    validationRule: { min: 5000, max: 300000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "alert"], sortOrder: 6,
  },

  // ═══ HARD-CODED CONSTANTS — AI Memory ═══
  {
    categoryKey: "decision", key: "ai.memory.check_interval_ms", displayName: "AI 内存检查间隔",
    description: "AI Memory 调度器检查间隔（毫秒）", valueType: "number", defaultValue: "60000",
    validationRule: { min: 10000, max: 600000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ai-memory"], sortOrder: 10,
  },
  {
    categoryKey: "decision", key: "ai.memory.cooldown_ms", displayName: "AI 内存冷却时间",
    description: "AI Memory 操作后冷却时间（毫秒）", valueType: "number", defaultValue: "120000",
    validationRule: { min: 10000, max: 600000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ai-memory"], sortOrder: 11,
  },

  // ═══ HARD-CODED CONSTANTS — AI Bridge ═══
  {
    categoryKey: "task", key: "ai.bridge.auth_timeout_ms", displayName: "AI Bridge 认证超时",
    description: "AI Bridge 设备认证超时（毫秒）", valueType: "number", defaultValue: "10000",
    validationRule: { min: 1000, max: 60000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ai-bridge"], sortOrder: 8,
  },
  {
    categoryKey: "task", key: "ai.bridge.task_timeout_ms", displayName: "AI Bridge 任务超时",
    description: "AI Bridge 任务执行超时（毫秒）", valueType: "number", defaultValue: "1800000",
    validationRule: { min: 60000, max: 86400000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ai-bridge"], sortOrder: 9,
  },
  {
    categoryKey: "task", key: "ai.bridge.sweep_interval_ms", displayName: "AI Bridge 清扫间隔",
    description: "AI Bridge 过期连接清扫间隔（毫秒）", valueType: "number", defaultValue: "30000",
    validationRule: { min: 5000, max: 300000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "ai-bridge"], sortOrder: 10,
  },

  // ═══ HARD-CODED CONSTANTS — Scrcpy ═══
  {
    categoryKey: "scrcpy", key: "scrcpy.h264_buffer_max_bytes", displayName: "H.264 缓冲区大小",
    description: "Scrcpy H.264 解码缓冲区最大字节数", valueType: "number", defaultValue: "2097152",
    validationRule: { min: 524288, max: 10485760, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["server", "scrcpy"], sortOrder: 4,
  },
  {
    categoryKey: "scrcpy", key: "scrcpy.max_chunks", displayName: "Scrcpy 最大分片",
    description: "Scrcpy 单帧最大分片数", valueType: "number", defaultValue: "200",
    validationRule: { min: 50, max: 500, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["server", "scrcpy"], sortOrder: 5,
  },

  // ═══ HARD-CODED CONSTANTS — Remote Command ═══
  {
    categoryKey: "task", key: "remote.command_timeout_ms", displayName: "远程命令超时",
    description: "远程 ADB 命令默认超时（毫秒）", valueType: "number", defaultValue: "15000",
    validationRule: { min: 1000, max: 120000, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global", "plan", "template", "group", "device"], tags: ["server", "remote"], sortOrder: 11,
  },

  // ═══ HARD-CODED CONSTANTS — Server Health ═══
  {
    categoryKey: "system", key: "system.health.cache_ttl_sec", displayName: "健康检查缓存 TTL",
    description: "服务健康检查结果缓存时间（秒）", valueType: "number", defaultValue: "5",
    validationRule: { min: 1, max: 120, required: true },
    isSecret: false, isOverridable: true, allowedScopes: ["global"], tags: ["server", "health"], sortOrder: 6,
  },
];
