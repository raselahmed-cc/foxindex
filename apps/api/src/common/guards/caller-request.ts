import type { Request } from 'express';

/**
 * A request after either AuthGuard (session → `user`) or ApiKeyGuard
 * (`apiKey`) ran. Per-caller helpers (rate limiting, idempotency) key on
 * whichever identity is present.
 */
export interface CallerRequest extends Request {
  user?: { id: string };
  apiKey?: { id: string; userId: string };
}
