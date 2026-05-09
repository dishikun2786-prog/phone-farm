import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(8443),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://phonefarm:phonefarm@localhost:5432/phonefarm'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().default('dev-secret-change-in-production'),
  DEVICE_AUTH_TOKEN: z.string().default('device-auth-token-change-me'),
  HEADSCALE_API_URL: z.string().default('http://127.0.0.1:8080'),
});

export const config = envSchema.parse(process.env);
