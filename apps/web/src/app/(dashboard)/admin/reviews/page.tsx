'use client';

import { useState } from 'react';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, EmptyState, ErrorBanner, Pill, Segmented, Skeleton, type Tone } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { fmtDateTime } from '@/lib/format';

type Status = 'pending' | 'approved' | 'rejected';

interface Review {
  id: string;
  rating: number;
  body: string;
  displayName: string;
  company: string | null;
  jobTitle: string | null;
  status: Status;
  featured: boolean;
  updatedAt: string;
  client: { id: string; name: string; email: string };
}

const STATUS: Record<Status, { tone: Tone; label: string }> = {
  pending: { tone: 'warn', label: 'Waiting for approval' },
  approved: { tone: 'ok', label: 'Published' },
  rejected: { tone: 'muted', label: 'Not published' },
};

export default function ReviewsAdminPage() {
  const toast = useToast();
  const [status, setStatus] = useState<Status | 'all'>('pending');
  const list = useApi<Review[]>(`/admin/reviews?status=${status}`);
  const [busy, setBusy] = useState<string | null>(null);

  async function moderate(r: Review, change: { status?: Status; featured?: boolean }, message: string) {
    setBusy(r.id);
    try {
      await apiClient.patch(`/admin/reviews/${r.id}`, change);
      toast(message);
      await list.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  }

  const rows = list.data ?? [];
  return (
    <>
      <DashboardTopbar title="Customer reviews" subtitle="Clients write them from Settings; only reviews you publish appear on the website" search={false} />
      <div className="mb-4">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: 'Waiting' },
            { value: 'approved', label: 'Published' },
            { value: 'rejected', label: 'Not published' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {list.error && <ErrorBanner message="Could not load reviews." onRetry={() => void list.reload()} />}
      {!list.data && !list.error ? (
        <div className="grid gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : rows.length === 0 ? (
        <Card><EmptyState title={status === 'pending' ? 'No reviews waiting' : 'No reviews here'}>Active clients can leave a review under Settings → Your review.</EmptyState></Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[15px] tracking-[2px] text-auth-fox" aria-label={`${r.rating} out of 5 stars`}>
                    {'★'.repeat(r.rating)}
                    <span className="text-auth-line2">{'★'.repeat(5 - r.rating)}</span>
                  </span>
                  <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed whitespace-pre-wrap">&ldquo;{r.body}&rdquo;</p>
                  <p className="mt-2 text-[12.5px] text-auth-text3">
                    Shown as <b className="font-medium text-auth-text2">{r.displayName}</b>
                    {[r.jobTitle, r.company].filter(Boolean).length > 0 && ` · ${[r.jobTitle, r.company].filter(Boolean).join(', ')}`}
                    {' '}· account {r.client.name} ({r.client.email}) · {fmtDateTime(r.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                  {r.featured && <Pill tone="info">Featured</Pill>}
                </div>
              </div>
              <div className="mt-3.5 flex flex-wrap gap-2">
                {r.status !== 'approved' && (
                  <Button size="sm" variant="primary" loading={busy === r.id} onClick={() => void moderate(r, { status: 'approved' }, 'Review published')}>Publish</Button>
                )}
                {r.status === 'approved' && (
                  <Button size="sm" loading={busy === r.id} onClick={() => void moderate(r, { featured: !r.featured }, r.featured ? 'No longer featured' : 'Featured on the signup page')}>
                    {r.featured ? 'Unfeature' : 'Feature on signup page'}
                  </Button>
                )}
                {r.status !== 'rejected' && (
                  <Button size="sm" loading={busy === r.id} onClick={() => void moderate(r, { status: 'rejected' }, r.status === 'approved' ? 'Review unpublished' : 'Review not published')}>
                    {r.status === 'approved' ? 'Unpublish' : "Don't publish"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
