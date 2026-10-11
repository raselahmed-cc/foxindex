import { createHash, randomBytes } from 'node:crypto';

export const API_KEY_PREFIX = 'fx_';
const KEY_PREFIX = 'fx_live_';

export interface GeneratedApiKey {
  /** Shown to the caller exactly once at creation time — never persisted. */
  plaintext: string;
  /** Safe to store/display: identifies the key without being usable to authenticate. */
  keyPrefix: string;
  keyHash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const plaintext = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { plaintext, keyPrefix: plaintext.slice(0, 12), keyHash: hashApiKey(plaintext) };
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
