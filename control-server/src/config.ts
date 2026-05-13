import { z } from "zod";

const envSchema = z.object({
  // ── Server ──
  PORT: z.coerce.number().default(8443),
  HOST: z.string().default("0.0.0.0"),
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
  DEEPSEEK_API_URL: z.string().default("https://api.deepseek.com/chat/completions"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  DEEPSEEK_MAX_TOKENS: z.coerce.number().default(512),
  DEEPSEEK_TEMPERATURE: z.coerce.number().default(0.1),

  // ── Qwen3-VL-Flash (辅助模型, 图像识别 ~10%, 阿里云百炼) ──
  DASHSCOPE_API_KEY: z.string().default(""),
  DASHSCOPE_API_URL: z.string().default("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"),
  DASHSCOPE_VL_MODEL: z.string().default("qwen3-vl-flash"),
  DASHSCOPE_VL_MAX_TOKENS: z.coerce.number().default(1024),
  DASHSCOPE_VL_TEMPERATURE: z.coerce.number().default(0.1),

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
});

export const config = envSchema.parse(process.env);
