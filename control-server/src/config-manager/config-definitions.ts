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
];
