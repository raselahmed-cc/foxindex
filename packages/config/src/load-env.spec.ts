import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, loadEnv } from './load-env';
import { httpUrlSchema, logLevelSchema, nodeEnvSchema, portSchema } from './env-primitives';

describe('loadEnv', () => {
  const schema = z.object({
    NODE_ENV: nodeEnvSchema,
    LOG_LEVEL: logLevelSchema,
    API_PORT: portSchema,
    API_URL: httpUrlSchema,
  });

  it('parses and coerces a valid environment', () => {
    const env = loadEnv(schema, {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      API_PORT: '3001',
      API_URL: 'https://api.example.com',
    } as unknown as NodeJS.ProcessEnv);

    expect(env.NODE_ENV).toBe('production');
    expect(env.API_PORT).toBe(3001);
    expect(typeof env.API_PORT).toBe('number');
  });

  it('applies declared defaults when a var is missing', () => {
    const env = loadEnv(schema, {
      API_PORT: '3001',
      API_URL: 'https://api.example.com',
    } as unknown as NodeJS.ProcessEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('throws InvalidEnvironmentError with an aggregated, readable message on failure', () => {
    expect(() =>
      loadEnv(schema, {
        API_PORT: 'not-a-port',
        API_URL: 'not-a-url',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(InvalidEnvironmentError);
  });
});
