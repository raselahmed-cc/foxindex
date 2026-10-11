import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyAccessToken } from '@foxindex/auth';
import type { UserRole, UserStatus } from '@foxindex/types';
import { AuthenticationError } from '../errors/app-error';

export interface RequestUser {
  id: string;
  role: UserRole;
  status: UserStatus;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * Bearer-token authentication against the stateless JWT access token
 * (docs/adr/0014 — replaces Better Auth's session-cookie guard). The access
 * token carries only {sub, role, status}; anything else a route needs about
 * the current user is a DB lookup in that route's own service, same as
 * before. Refresh-token validation (the actual revocable, DB-backed check)
 * happens only in AuthService.refresh(), not here.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      throw new AuthenticationError();
    }

    try {
      const payload = verifyAccessToken(token, this.config.getOrThrow<string>('JWT_SECRET'));
      (request as AuthenticatedRequest).user = { id: payload.sub, role: payload.role, status: payload.status };
      return true;
    } catch {
      throw new AuthenticationError('Invalid or expired token');
    }
  }
}
