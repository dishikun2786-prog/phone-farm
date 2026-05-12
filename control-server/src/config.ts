import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(8443),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://phonefarm:phonefarm@localhost:5432/phonefarm'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().default('dev-secret-change-in-production'),
  DEVICE_AUTH_TOKEN: z.string().default('device-auth-token-change-me'),
  UDP_RELAY_PORT: z.coerce.number().default(8444),
  VLM_API_URL: z.string().default('http://localhost:5000/api/vlm/execute'),
  VLM_MODEL_NAME: z.string().default('autoglm-phone-9b'),
  VLM_MAX_STEPS: z.coerce.number().default(50),
  VLM_TRACE_DIR: z.string().default('data/episodes'),
  SCRCPY_JAR_PATH: z.string().default('bin/scrcpy-server.jar'),
  SCRCPY_MAX_SIZE: z.coerce.number().default(1080),
  SCRCPY_BIT_RATE: z.coerce.number().default(4_000_000),
  SCRCPY_MAX_FPS: z.coerce.number().default(30),
});

export const config = envSchema.parse(process.env);
