import { z } from 'zod';

export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

export const logLevelSchema = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  .default('info');

export const portSchema = z.coerce.number().int().min(1).max(65535);

export const httpUrlSchema = z.string().url();

export const nonEmptyStringSchema = z.string().min(1);
