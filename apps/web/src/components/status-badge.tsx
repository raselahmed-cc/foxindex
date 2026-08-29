import { Badge } from '@/components/ui/badge';

const VARIANT_BY_STATE: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  VERIFIED: 'success',
  FAILED: 'destructive',
  RECEIVED: 'secondary',
  VALIDATING: 'secondary',
  ACCEPTED: 'secondary',
  QUEUED: 'outline',
  PROCESSING: 'outline',
  SUBMITTED: 'success',
  MONITORING: 'outline',
  INDEXED: 'success',
  NOT_INDEXED: 'secondary',
};

/** Maps a domain verification / URL submission state string to a consistent badge — same states, same colors everywhere in the dashboard. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANT_BY_STATE[status] ?? 'default'}>{status}</Badge>;
}
