import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedApiKey } from '../guards/api-key.guard';
import type { RequestUser } from '../guards/auth.guard';

export interface Caller {
  /** The account acting — the session user, or the API key's owner. */
  userId: string;
  /** Present when the request was authenticated with an API key. */
  apiKey: AuthenticatedApiKey | null;
}

/** For routes behind SessionOrApiKeyGuard. */
export const CurrentCaller = createParamDecorator((_data: unknown, context: ExecutionContext): Caller => {
  const request = context.switchToHttp().getRequest<{ user?: RequestUser; apiKey?: AuthenticatedApiKey }>();
  if (request.apiKey) return { userId: request.apiKey.userId, apiKey: request.apiKey };
  return { userId: request.user!.id, apiKey: null };
});
