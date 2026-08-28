import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { logEvent, withContext } from './logger';

function createCapturingLogger() {
  const lines: string[] = [];
  const stream = {
    write(chunk: string) {
      lines.push(chunk);
    },
  };
  const logger = pino(
    {
      base: { service: 'test' },
      redact: { paths: ['password', '*.password'], censor: '[REDACTED]' },
    },
    stream,
  );
  return { logger, lines };
}

describe('logger', () => {
  it('redacts configured secret fields', () => {
    const { logger, lines } = createCapturingLogger();
    logger.info({ password: 'super-secret' }, 'user logged in');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.service).toBe('test');
  });

  it('withContext attaches fields to every subsequent log line', () => {
    const { logger, lines } = createCapturingLogger();
    const scoped = withContext(logger, { organizationId: 'org_123', requestId: 'req_456' });
    scoped.info('did a thing');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.organizationId).toBe('org_123');
    expect(parsed.requestId).toBe('req_456');
  });

  it('logEvent writes the {event, message, metadata} shape', () => {
    const { logger, lines } = createCapturingLogger();
    logEvent(logger, 'domain.verified', 'Domain verified', { domainId: 'dom_1' });
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe('domain.verified');
    expect(parsed.msg).toBe('Domain verified');
    expect(parsed.metadata).toEqual({ domainId: 'dom_1' });
  });
});
