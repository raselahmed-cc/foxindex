import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedApiKey, ApiKeyAuthenticatedRequest } from '../guards/api-key.guard';

/** Undefined when the request authenticated via session rather than an API key. */
export const CurrentApiKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedApiKey | undefined =>
    context.switchToHttp().getRequest<Partial<ApiKeyAuthenticatedRequest>>().apiKey,
);
