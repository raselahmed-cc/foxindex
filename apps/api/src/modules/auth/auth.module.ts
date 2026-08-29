import { Module } from '@nestjs/common';
import { MeController } from './me.controller';

/**
 * Better Auth's own routes (sign-up/in/out, verify-email, reset-password) are
 * mounted directly on the raw Express app in main.ts, not through this module —
 * they need the unparsed request body, which conflicts with going through
 * Nest's router. This module only owns /me, which composes the session via
 * AuthGuard.
 */
@Module({
  controllers: [MeController],
})
export class AuthModule {}
