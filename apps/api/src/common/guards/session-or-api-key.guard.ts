import { type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ApiKeyScopeName } from '@foxindex/validation';
import { AuthorizationError } from '../errors/app-error';
import { API_KEY_PREFIX } from '../../modules/api-keys/generate-api-key';
import { AuthGuard } from './auth.guard';
import { ApiKeyGuard, type ApiKeyAuthenticatedRequest } from './api-key.guard';

export const API_SCOPE_KEY = 'apiKeyScope';
/** Scope an API key needs for this route. Dashboard sessions are not scope-limited. */
export const ApiScope = (scope: ApiKeyScopeName) => SetMetadata(API_SCOPE_KEY, scope);

/**
 * Accepts either a dashboard session (JWT access token) or a public API key.
 * Both arrive as `Authorization: Bearer …`, so dispatch on the API key's
 * `fx_` prefix — a session token is a JWT and never starts with it.
 */
@Injectable()
export class SessionOrApiKeyGuard implements CanActivate {
  constructor(
    @Inject(AuthGuard) private readonly authGuard: AuthGuard,
    @Inject(ApiKeyGuard) private readonly apiKeyGuard: ApiKeyGuard,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7).trim() : '';
    if (!token.startsWith(API_KEY_PREFIX)) return this.authGuard.canActivate(context);

    await this.apiKeyGuard.canActivate(context);
    const scope = this.reflector.getAllAndOverride<ApiKeyScopeName | undefined>(API_SCOPE_KEY, [context.getHandler(), context.getClass()]);
    const key = (request as ApiKeyAuthenticatedRequest).apiKey;
    if (scope && !key.scopes.includes(scope)) {
      throw new AuthorizationError(`This API key doesn't have the "${scope}" permission`);
    }
    return true;
  }
}
