import { randomInt } from 'node:crypto';

/** CLAUDE.md "Account lifecycle": 6-digit code, zero-padded so every code is exactly 6 characters. */
export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
