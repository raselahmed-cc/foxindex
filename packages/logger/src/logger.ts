import pino, { type Logger } from 'pino';

export interface LoggerContext {
  requestId?: string;
  traceId?: string;
  userId?: string;
  projectId?: string;
  jobId?: string;
  [key: string]: unknown;
}

/**
 * Paths pino redacts to `[REDACTED]` before a log line is ever serialized, so
 * secrets can't leak even if a caller accidentally logs a whole object that
 * happens to contain one (constitution §23/§20).
 */
const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'apiKey',
  '*.apiKey',
  'indexnowKey',
  '*.indexnowKey',
  'authorization',
  '*.authorization',
  'req.headers.authorization',
  'req.headers.cookie',
];

export function createLogger(service: string, level: string = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino({
    level,
    base: { service },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/** Attaches request/trace/tenant context that should appear on every subsequent log line. */
export function withContext(logger: Logger, context: LoggerContext): Logger {
  return logger.child(context);
}

/** Convenience for the structured `{event, message, metadata}` shape used across FoxIndex. */
export function logEvent(
  logger: Logger,
  event: string,
  message: string,
  metadata?: Record<string, unknown>,
): void {
  logger.info({ event, metadata }, message);
}
