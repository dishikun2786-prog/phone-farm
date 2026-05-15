import { z } from "zod";

const envSchema = z.object({
  // ── Server ──
  PORT: z.coerce.number().default(8443),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z.string().default("*"),
  DATABASE_URL: z.string().default("postgresql://phonefarm:phonefarm@localhost:5432/phonefarm"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
  DEVICE_AUTH_TOKEN: z.string().default("device-auth-token-change-me"),
  UDP_RELAY_PORT: z.coerce.number().default(8444),

  // ── Legacy VLM (保留兼容) ──
  VLM_API_URL: z.string().default("http://localhost:5000/api/vlm/execute"),
  VLM_MODEL_NAME: z.string().default("autoglm-phone-9b"),
  VLM_MAX_STEPS: z.coerce.number().default(50),
  VLM_TRACE_DIR: z.string().default("data/episodes"),

  // ── DeepSeek V4 Flash (主模型, 文本决策 ~90%) ──
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_API_URL: z.string().default("https://api.deepseek.com/anthropic"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  DEEPSEEK_MAX_TOKENS: z.coerce.number().default(512),
  DEEPSEEK_TEMPERATURE: z.coerce.number().default(0.1),

  // ── Qwen3-VL-Plus (辅助模型, 图像识别 ~10%, 阿里云百炼) ──
  DASHSCOPE_API_KEY: z.string().default(""),
  DASHSCOPE_API_URL: z.string().default("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"),
  DASHSCOPE_VL_MODEL: z.string().default("qwen3-vl-plus"),
  DASHSCOPE_VL_MAX_TOKENS: z.coerce.number().default(1024),
  DASHSCOPE_VL_TEMPERATURE: z.coerce.number().default(0.1),

  // ── GUI-Plus (GUI自动化模型, 阿里云百炼, 手机+电脑端操作) ──
  GUI_PLUS_API_KEY: z.string().default(""),
  GUI_PLUS_API_URL: z.string().default("https://dashscope.aliyuncs.com/compatible-mode/v1"),
  GUI_PLUS_MODEL: z.string().default("gui-plus-2026-02-26"),
  GUI_PLUS_MAX_STEPS: z.coerce.number().default(30),
  GUI_PLUS_MAX_TOKENS: z.coerce.number().default(32768),
  GUI_PLUS_TEMPERATURE: z.coerce.number().default(0.1),
  GUI_PLUS_ENABLED: z.coerce.boolean().default(false),

  // ── Volcano Engine ARK (火山方舟) — UI-TARS-72B ──
  VOLCENGINE_API_KEY: z.string().default(""),
  VOLCENGINE_API_URL: z.string().default("https://ark.cn-beijing.volces.com/api/v3/chat/completions"),

  // ── Routing Thresholds ──
  ROUTER_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.7),
  ROUTER_MAX_CONSECUTIVE_FAILURES: z.coerce.number().default(3),
  ROUTER_MAX_LOW_CONFIDENCE: z.coerce.number().default(3),

  // ── Edge State ──
  EDGE_STATE_TTL_SEC: z.coerce.number().default(300),

  // ── Video Stream ──
  STREAM_IDLE_TIMEOUT_SEC: z.coerce.number().default(300),
  STREAM_MAX_DURATION_SEC: z.coerce.number().default(1800),

  // ── Experience Compiler ──
  EXPERIENCE_COMPILE_INTERVAL_MIN: z.coerce.number().default(30),
  EXPERIENCE_MIN_DEVICES: z.coerce.number().default(3),

  // ── Alibaba Cloud SMS ──
  ALIBABA_CLOUD_ACCESS_KEY_ID: z.string().default(""),
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: z.string().default(""),
  SMS_SIGN_NAME: z.string().default("广州修己科技文化传媒有限"),
  SMS_TEMPLATE_CODE: z.string().default("SMS_330410954"),
  SMS_RATE_LIMIT_SEC: z.coerce.number().default(60),

  // ── Feature Flags ──
  FF_DECISION_ENGINE: z.coerce.boolean().default(true),
  FF_QWEN_VL_FALLBACK: z.coerce.boolean().default(true),
  FF_STREAM_ON_DEMAND: z.coerce.boolean().default(true),
  FF_CROSS_DEVICE_MEMORY: z.coerce.boolean().default(true),
  FF_LEGACY_VLM: z.coerce.boolean().default(true),

  // ── Scrcpy (保留) ──
  SCRCPY_JAR_PATH: z.string().default("bin/scrcpy-server.jar"),
  SCRCPY_MAX_SIZE: z.coerce.number().default(1080),
  SCRCPY_BIT_RATE: z.coerce.number().default(4_000_000),
  SCRCPY_MAX_FPS: z.coerce.number().default(30),

  // ── NATS State Sync ──
  NATS_URL: z.string().default("nats://localhost:4222"),
  NATS_TOKEN: z.string().default(""),
  NATS_ENABLED: z.coerce.boolean().default(true),

  // ── MinIO Object Storage ──
  MINIO_ENDPOINT: z.string().default("localhost:9000"),
  MINIO_ACCESS_KEY: z.string().default("minioadmin"),
  MINIO_SECRET_KEY: z.string().default("minioadmin"),
  MINIO_BUCKET: z.string().default("phonefarm"),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  MINIO_ENABLED: z.coerce.boolean().default(true),

  // ── Ray Cluster ──
  RAY_ADDRESS: z.string().default("http://localhost:8265"),
  RAY_ENABLED: z.coerce.boolean().default(true),

  // ── WebRTC / Signaling ──
  TURN_SERVER_URL: z.string().default("turn:47.243.254.248:3478?transport=udp"),
  TURN_USERNAME: z.string().default("phonefarm"),
  TURN_CREDENTIAL: z.string().default(""),
  STUN_SERVER_URL: z.string().default("stun:47.243.254.248:3478"),
  WEBRTC_ENABLED: z.coerce.boolean().default(true),

  // ── Edge Node ──
  EDGE_NODE_ENABLED: z.coerce.boolean().default(false),
  EDGE_NODE_PORT: z.coerce.number().default(9090),

  // ── Multi-Tenancy ──
  DEFAULT_TENANT_SLUG: z.string().default("default"),
  TENANT_ISOLATION_ENABLED: z.coerce.boolean().default(true),

  // ── Feature Flags (Phase 2-5) ──
  FF_WEBRTC_P2P: z.coerce.boolean().default(true),
  FF_NATS_SYNC: z.coerce.boolean().default(true),
  FF_RAY_SCHEDULER: z.coerce.boolean().default(true),
  FF_FEDERATED_LEARNING: z.coerce.boolean().default(false),
  FF_P2P_GROUP_CONTROL: z.coerce.boolean().default(false),
  FF_MODEL_HOT_UPDATE: z.coerce.boolean().default(true),
  FF_GUI_PLUS: z.coerce.boolean().default(false),
});

export const config = envSchema.parse(process.env);
