import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { SERVICE_NAMES } from '@foxindex/config';
import { createLogger, logEvent } from '@foxindex/logger';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi/document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);

  // Combined with URI versioning below, routes resolve to /api/v1/... exactly as
  // specified in constitution §17.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({ origin: config.getOrThrow<string>('CORS_ORIGIN'), credentials: true });
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
