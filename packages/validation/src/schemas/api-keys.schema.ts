import { z } from 'zod';
import { ApiKeyScope } from '@foxindex/types';

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  projectId: z.uuid().optional(),
  scopes: z.array(z.enum(ApiKeyScope)).min(1).default([ApiKeyScope.SUBMIT_URLS]),
  expiresAt: z.coerce.date().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
