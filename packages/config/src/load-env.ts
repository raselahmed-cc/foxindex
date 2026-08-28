import type { ZodError, ZodType } from 'zod';

export class InvalidEnvironmentError extends Error {
  constructor(public readonly issues: ZodError['issues']) {
    const summary = issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    super(`Invalid environment configuration:\n${summary}`);
    this.name = 'InvalidEnvironmentError';
  }
}

/**
 * Validates `process.env` (or a supplied source) against a Zod schema and throws a
 * readable, aggregated error on failure instead of the app booting with undefined
 * config values. Each app/worker defines its own schema from the primitives in
 * ./env-primitives — this function only owns the parse-and-fail-fast mechanism.
 */
export function loadEnv<T>(schema: ZodType<T>, source: NodeJS.ProcessEnv = process.env): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvironmentError(result.error.issues);
  }
  return result.data;
}
