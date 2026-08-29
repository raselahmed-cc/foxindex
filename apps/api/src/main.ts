import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Must run before any other import — @foxindex/auth reads process.env at
// module-load time (its top-level betterAuth(...) call), which happens before
// ConfigModule.forRoot() below ever runs. Same pattern as workers/*/src/main.ts.
loadDotenv({ path: resolve(__dirname, '../../../.env'), quiet: true });

import 'reflect-metadata';
import cors from 'cors';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { auth } from '@foxindex/auth';
import { SERVICE_NAMES } from '@foxindex/config';
import { createLogger, logEvent } from '@foxindex/logger';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi/document';

async function bootstrap(): Promise<void> {
  const expressInstance = express();

  // Express matches routes/middleware in registration order, and the Better
  // Auth mount below ends the request itself (never calls next()) — so CORS
  // has to be applied here, directly on the raw Express instance, before that
  // mount. app.enableCors() further down runs too late for these routes: by
  // the time Nest adds it, Better Auth has already claimed everything under
  // /api/auth/* and a browser's preflight OPTIONS never reaches it.
  expressInstance.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));

  // Better Auth needs the raw, unparsed request body, so its handler must be
  // mounted before any body-parsing middleware runs — including Nest's own
  // default one, which is why NestFactory.create() below passes
  // { bodyParser: false } and we add express.json()/urlencoded() ourselves,
  // after this line. This route is NOT versioned (/api/auth/*, not
  // /api/v1/auth/*) and bypasses Nest's router entirely, matching Better
  // Auth's own documented Express integration.
  expressInstance.all('/api/auth/*splat', toNodeHandler(auth));

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressInstance),
    { bufferLogs: true, bodyParser: false },
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const config = app.get(ConfigService);

  // Combined with URI versioning below, non-auth routes resolve to /api/v1/...
  // exactly as specified in constitution §17.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // CORS is already applied above, directly on expressInstance, before the
  // Better Auth mount — a second app.enableCors() here would just duplicate
  // the Access-Control-Allow-Origin header on every other route.
  app.enableShutdownHooks();

  // SwaggerModule does NOT pick up setGlobalPrefix() automatically (it mounts
  // via the raw HTTP adapter, not Nest's prefix-aware router) — the full path
  // has to be spelled out, or 'docs' would end up served at /docs instead of
  // /api/docs.
  SwaggerModule.setup('api/docs', app, buildOpenApiDocument());

  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port);

  const logger = createLogger(SERVICE_NAMES.API);
  logEvent(logger, 'api.started', `FoxIndex API listening on port ${port}`, { port });
}

bootstrap();
