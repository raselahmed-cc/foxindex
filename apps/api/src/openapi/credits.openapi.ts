import { z } from 'zod';
import { openApiRegistry } from './registry';

const creditTransactionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  amount: z.number().int(),
  type: z.enum(['signup_bonus', 'manual_add', 'submission_deduct', 'refund', 'payment_credit']),
  performedBy: z.uuid().nullable(),
  referenceId: z.uuid().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/credits',
  summary: 'Get the signed-in user’s own credit balance and recent transactions',
  tags: ['Credits'],
  security: [{ bearer: [] }],
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({ balance: z.number().int(), recentTransactions: z.array(creditTransactionSchema) }),
        },
      },
    },
  },
});
