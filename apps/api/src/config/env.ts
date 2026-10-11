import { z } from 'zod';
import { httpUrlSchema, loadEnv, logLevelSchema, nodeEnvSchema, portSchema } from '@foxindex/config';

const boolString = z.enum(['true', 'false']).optional();

/** Values from .env.example that must never reach production. */
const PLACEHOLDER = /change-me|dev-only|ci-only|example|changeme/i;

const envSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    LOG_LEVEL: logLevelSchema,
    API_PORT: portSchema.default(3001),
    /** The web app's public origin — CORS, socket.io and links in emails. */
    CORS_ORIGIN: httpUrlSchema,
    DATABASE_URL: z.string().min(1),
    /** Managed Postgres (Neon, RDS…) needs TLS. */
    DATABASE_SSL: boolString,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).optional(),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    /** Encrypts provider API keys and service-account private keys at rest. Never rotate without re-encrypting. */
    ENCRYPTION_KEY: z.string().min(16),
    /** Public origin of this API — used for payment-gateway return/IPN URLs. */
    API_PUBLIC_URL: httpUrlSchema.default('http://localhost:3001'),
    /** Express "trust proxy" — hops/CIDRs of the reverse proxy in front (Caddy, Cloudflare). */
    TRUST_PROXY: z.string().optional(),
    /** Serve Swagger at /api/docs. Off by default in production. */
    API_DOCS_ENABLED: boolString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    // Fail fast on weak or copied-from-example secrets instead of running insecurely.
    if (env.JWT_SECRET.length < 32 || PLACEHOLDER.test(env.JWT_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Use a random secret of at least 32 characters in production (e.g. `openssl rand -base64 48`)' });
    }
    if (env.ENCRYPTION_KEY.length < 32 || PLACEHOLDER.test(env.ENCRYPTION_KEY)) {
      ctx.addIssue({ code: 'custom', path: ['ENCRYPTION_KEY'], message: 'Use a random key of at least 32 characters in production — and back it up: it decrypts stored provider credentials' });
    }
    if (env.JWT_SECRET === env.ENCRYPTION_KEY) {
      ctx.addIssue({ code: 'custom', path: ['ENCRYPTION_KEY'], message: 'ENCRYPTION_KEY must differ from JWT_SECRET' });
    }
    if (!env.CORS_ORIGIN.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: 'Must be the https:// origin of the web app in production' });
    }
  });

export type ApiEnv = z.infer<typeof envSchema>;

export function loadApiEnv(): ApiEnv {
  return loadEnv(envSchema);
}
