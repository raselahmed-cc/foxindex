import { z } from 'zod';
import { httpUrlSchema, loadEnv, logLevelSchema, nodeEnvSchema, portSchema } from '@foxindex/config';

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
  API_PORT: portSchema.default(3001),
  CORS_ORIGIN: httpUrlSchema,
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: httpUrlSchema,
});

export type ApiEnv = z.infer<typeof envSchema>;

export function loadApiEnv(): ApiEnv {
  return loadEnv(envSchema);
}
