import { z } from 'zod';
import { INDEXNOW_KEY_MAX_LENGTH, INDEXNOW_KEY_MIN_LENGTH } from '@foxindex/config';

/**
 * Validates the full character/length range the IndexNow protocol allows for a key
 * (indexnow.org/documentation), not just the hex subset FoxIndex itself generates —
 * this is defense-in-depth validation for any key value flowing through the system.
 */
export const indexNowKeySchema = z
  .string()
  .min(INDEXNOW_KEY_MIN_LENGTH)
  .max(INDEXNOW_KEY_MAX_LENGTH)
  .regex(/^[a-zA-Z0-9-]+$/, 'IndexNow key may only contain letters, digits, and dashes');
