import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from '@nestjs/swagger';
import { openApiRegistry } from './registry';
import './health.openapi';

/**
 * zod-to-openapi and @nestjs/swagger each vendor their own (near-identical,
 * structurally incompatible at the TS level) OpenAPI 3.1 type definitions, and
 * zod-to-openapi's own type isn't portably importable from a composite project
 * (TS2742 — it lives several pnpm-internal directories deep). The cast is safe:
 * SwaggerModule.setup() only ever serves this as plain JSON, so a type-only
 * mismatch between two libraries' copies of the same spec doesn't matter at
 * runtime. Declaring the public return type as @nestjs/swagger's own
 * OpenAPIObject (a real, direct dependency of this package) keeps the cast
 * contained here instead of leaking to every call site.
 */
export function buildOpenApiDocument(): OpenAPIObject {
  const generator = new OpenApiGeneratorV31(openApiRegistry.definitions);
  const document = generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'FoxIndex API',
      version: '1.0.0',
      description:
        'FoxIndex accepts URLs for fast, legitimate discovery submission (IndexNow), verifies domain ownership, and reports submission status. It does not and cannot guarantee Google will index a given URL — see /docs/architecture.md.',
    },
    servers: [{ url: '/api/v1', description: 'Current version' }],
  });
  return document as unknown as OpenAPIObject;
}
