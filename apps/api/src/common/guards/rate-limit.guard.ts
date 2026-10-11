import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type IORedis from 'ioredis';
import { RateLimitedError } from '../errors/app-error';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../decorators/rate-limit.decorator';
import type { CallerRequest } from './caller-request';

/**
 * Per-caller fixed-window rate limiting (constitution §13 — Cloudflare/
 * provider tiers are out of scope until those are actually deployed). A
 * simple INCR+EXPIRE counter, not a token bucket — good enough for Phase
 * 1's one rate-limited route. Scoped by user id for a session caller, or
 * by project id for an API-key caller (docs/adr/0013: an API key doesn't
 * carry a user id directly, and its own project id is a perfectly stable
 * per-caller identifier for this purpose).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<CallerRequest>();
    const identifier = request.user?.id ?? request.apiKey?.userId ?? request.ip ?? 'unknown';
    const key = `ratelimit:${options.scope}:${identifier}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, options.windowSeconds);
    }
    if (count > options.limit) {
      throw new RateLimitedError(
        `Rate limit exceeded: ${options.limit} requests per ${options.windowSeconds}s`,
      );
    }
    return true;
  }
}
