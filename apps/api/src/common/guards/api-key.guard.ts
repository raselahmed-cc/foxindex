import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticationError, AuthorizationError } from '../errors/app-error';
import { hashApiKey } from '../../modules/api-keys/generate-api-key';
import { ApiKeysRepository } from '../../modules/api-keys/api-keys.repository';
import { ipAllowed } from './ip-allowlist';

export interface AuthenticatedApiKey {
  id: string;
  userId: string;
  scopes: string[];
  siteId: string | null;
  monthlyCreditCap: number | null;
}

export interface ApiKeyAuthenticatedRequest extends Request {
  apiKey: AuthenticatedApiKey;
}

/** Bearer-token authentication for programmatic access. Usage counters are written off the request path. */
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
    if (key.ipAllowlist.length > 0 && !ipAllowed(request.ip ?? '', key.ipAllowlist)) {
      throw new AuthorizationError('This API key is not allowed from your IP address');
    }

    void this.repository.recordUse(key.id).catch(() => undefined);

    (request as ApiKeyAuthenticatedRequest).apiKey = {
      id: key.id,
      userId: key.userId,
      scopes: key.scopes,
      siteId: key.siteId,
      monthlyCreditCap: key.monthlyCreditCap,
    };
    return true;
  }
}
