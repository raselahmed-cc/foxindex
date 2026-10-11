import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

/**
 * A single shared registry every module's *.openapi.ts file registers its
 * paths/schemas into. Built directly from Zod schemas via zod-to-openapi rather
 * than @nestjs/swagger's decorator-based scanning, since FoxIndex's DTOs are
 * plain Zod-inferred types with no class-validator/class-transformer decorators
 * for Nest's scanner to read.
 */
export const openApiRegistry = new OpenAPIRegistry();

openApiRegistry.registerComponent('securitySchemes', 'bearer', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Short-lived JWT access token returned by POST /auth/login (docs/adr/0014).',
});

openApiRegistry.registerComponent('securitySchemes', 'apiKey', {
  type: 'http',
  scheme: 'bearer',
  description: 'Bearer fx_live_... API key (see the api-keys module).',
});
