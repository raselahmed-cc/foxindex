import { z } from 'zod';
import { CreditLedgerReason } from '@foxindex/types';
import { openApiRegistry } from './registry';

const creditLedgerEntrySchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  delta: z.number().int(),
  reason: z.enum(CreditLedgerReason),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

const organizationIdParam = z.object({ organizationId: z.uuid() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/organizations/{organizationId}/credits',
  summary: 'Get the organization’s credit balance and recent ledger entries',
  tags: ['Credits'],
  security: [{ session: [] }],
  request: { params: organizationIdParam },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({ balance: z.number().int(), recentLedger: z.array(creditLedgerEntrySchema) }),
        },
      },
    },
    404: { description: 'Not found' },
  },
});
