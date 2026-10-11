// .env is loaded by bootstrap.ts, which requires this file only afterward —
// see the comment there for why that has to be a separate, import-free file
// rather than a few lines at the top of this one.
import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { SERVICE_NAMES } from '@foxindex/config';
import { createLogger, logEvent } from '@foxindex/logger';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi/document';
import { RedisIoAdapter } from './chat/redis-io.adapter';

const logger = createLogger(SERVICE_NAMES.API);

/** Baseline security headers for a JSON API (no HTML is served except Swagger). */
function securityHeaders(production: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

/** "1" → hop count, "true"/"false" → boolean, anything else → address/CIDR list for Express. */
function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value) return 'loopback, linklocal, uniquelocal';
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const production = config.get<string>('NODE_ENV') === 'production';

  // Real client IPs (rate limits, API-key IP allowlists, audit logs) come from the
  // reverse proxy's X-Forwarded-For — but only trust it from the proxy itself.
  app.set('trust proxy', parseTrustProxy(config.get<string>('TRUST_PROXY')));
  app.disable('x-powered-by');
  app.use(securityHeaders(production));

  // A full 10,000-URL batch is ~1-2 MB of JSON; Express's 100 KB default would reject it.
  app.useBodyParser('json', { limit: '4mb' });

  // Needed to read the httpOnly refresh-token cookie in AuthController.
  app.use(cookieParser());

  app.enableCors({
    origin: config.getOrThrow<string>('CORS_ORIGIN'),
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'Retry-After'],
    maxAge: 600,
  });

  // Redis-backed adapter so the chat gateway's rooms broadcast correctly
  // across every API replica, not just within one process.
  const redisIoAdapter = new RedisIoAdapter(app, config.getOrThrow<string>('REDIS_URL'));
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Combined with URI versioning below, non-auth routes resolve to /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // SIGTERM → close the HTTP server, sockets, DB pool and Redis before exiting (rolling deploys).
  app.enableShutdownHooks();

  // SwaggerModule mounts via the raw HTTP adapter (not prefix-aware), so the full
  // path is spelled out. Off in production unless explicitly enabled.
  const docsEnabled = config.get<string>('API_DOCS_ENABLED') ? config.get<string>('API_DOCS_ENABLED') === 'true' : !production;
  if (docsEnabled) SwaggerModule.setup('api/docs', app, buildOpenApiDocument());

  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port, '0.0.0.0');
  logEvent(logger, 'api.started', `FoxIndex API listening on port ${port}`, { port, production, docsEnabled });
}

bootstrap().catch((error: unknown) => {
  // Invalid configuration or an unreachable dependency at boot: log clearly and exit
  // non-zero so the orchestrator restarts/alerts instead of serving half-initialized.
  logEvent(logger, 'api.startup_failed', 'FoxIndex API failed to start', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
