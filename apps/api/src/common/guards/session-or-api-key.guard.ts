import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from './auth.guard';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Accepts either a Better Auth session cookie OR a Bearer API key — the
 * submissions endpoint is the one route both a human (dashboard) and a
 * programmatic caller (API key) need to reach. Dispatches on whether an
 * Authorization: Bearer header is present rather than trying both and
 * catching failures, so a malformed Bearer header gets ApiKeyGuard's specific
 * error instead of silently falling through to a confusing session error.
 */
@Injectable()
export class SessionOrApiKeyGuard implements CanActivate {
  constructor(
    @Inject(AuthGuard) private readonly authGuard: AuthGuard,
    @Inject(ApiKeyGuard) private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers.authorization?.startsWith('Bearer ')) {
      return this.apiKeyGuard.canActivate(context);
    }
    return this.authGuard.canActivate(context);
  }
}
