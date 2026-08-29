import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '@foxindex/auth';
import { AuthenticationError } from '../errors/app-error';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>['user'];

export interface AuthenticatedRequest extends Request {
  user: SessionUser;
  sessionId: string;
}

/**
 * Session-cookie authentication via Better Auth. API-key authentication (for
 * programmatic submission) is a separate guard added alongside the api-keys
 * module — this one only covers the browser/dashboard session path.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });

    if (!session) {
      throw new AuthenticationError();
    }

    (request as AuthenticatedRequest).user = session.user;
    (request as AuthenticatedRequest).sessionId = session.session.id;
    return true;
  }
}
