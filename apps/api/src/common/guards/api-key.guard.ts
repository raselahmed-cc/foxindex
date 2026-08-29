import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticationError } from '../errors/app-error';
import { hashApiKey } from '../../modules/api-keys/generate-api-key';
import { ApiKeysRepository } from '../../modules/api-keys/api-keys.repository';

export interface AuthenticatedApiKey {
  id: string;
  organizationId: string;
  projectId: string | null;
  scopes: string[];
}

export interface ApiKeyAuthenticatedRequest extends Request {
  apiKey: AuthenticatedApiKey;
}

/**
 * Bearer-token authentication for programmatic access (constitution §19's "API
 * requests" path — used alongside session auth on the submissions endpoint,
 * not in place of it). Never blocks the request on the lastUsedAt write.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject(ApiKeysRepository) private readonly repository: ApiKeysRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or malformed Authorization header');
    }

    const plaintext = header.slice('Bearer '.length).trim();
    const key = await this.repository.findActiveByHash(hashApiKey(plaintext));
    if (!key) {
      throw new AuthenticationError('Invalid or revoked API key');
    }

    void this.repository.touchLastUsed(key.id);

    (request as ApiKeyAuthenticatedRequest).apiKey = {
      id: key.id,
      organizationId: key.organizationId,
      projectId: key.projectId,
      scopes: key.scopes,
    };
    return true;
  }
}
