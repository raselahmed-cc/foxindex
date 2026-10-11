import type { Tone } from '@/components/dash/ui';
import type { PaymentStatus } from './api-types';

export const PAYMENT_STATUS: Record<PaymentStatus, { tone: Tone; label: string }> = {
  pending: { tone: 'muted', label: 'Awaiting payment' },
  under_review: { tone: 'warn', label: 'Under review' },
  approved: { tone: 'ok', label: 'Approved' },
  rejected: { tone: 'bad', label: 'Rejected' },
  expired: { tone: 'muted', label: 'Expired' },
};
