import { randomBytes } from 'node:crypto';
import { INDEXNOW_GENERATED_KEY_LENGTH } from '@foxindex/config';

/** Generates a FoxIndex-issued IndexNow key: hex, INDEXNOW_GENERATED_KEY_LENGTH chars. */
export function generateIndexNowKey(): string {
  return randomBytes(INDEXNOW_GENERATED_KEY_LENGTH / 2).toString('hex');
}

/** The key-file URL a domain must host the key at for verification/submission. */
export function indexNowKeyFileUrl(hostname: string, indexnowKey: string): string {
  return `https://${hostname}/${indexnowKey}.txt`;
}
