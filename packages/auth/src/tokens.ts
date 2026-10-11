import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { JWT_ACCESS_TOKEN_TTL_SECONDS } from '@foxindex/config';
import type { UserRole, UserStatus } from '@foxindex/types';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  status: UserStatus;
}

/** Stateless — short-lived, never persisted. Verified on every request by AuthGuard. */
export function signAccessToken(payload: AccessTokenPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: JWT_ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  return jwt.verify(token, secret) as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings, not JWTs — the `sessions` table
 * is the source of truth for validity/revocation (docs: CLAUDE.md "Auth" —
 * "server-side sessions table"), so there's nothing to gain from a signed
 * token here. Only the sha256 hash is ever persisted, same pattern as API
 * key hashing elsewhere in this codebase — the plaintext value is returned
 * once, to the client, and never stored.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
