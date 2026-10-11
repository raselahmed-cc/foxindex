'use client';

import { useState } from 'react';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Avatar, Button, Card, EmptyState, ErrorBanner, Field, Modal, Pill, Segmented, Skeleton, Stat, Table, Textarea, useCopy } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { useUser } from '@/lib/user-context';
import { useNav } from '@/lib/nav-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { PAYMENT_STATUS } from '@/lib/billing-labels';
import type { PaymentStatus, StaffPayment } from '@/lib/api-types';
import { fmtBdtCompact, fmtDateTime, fmtMoney, fmtNumber, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const REJECT_REASONS = ['Transaction ID not found in our statement', 'Amount received does not match', 'Duplicate of an earlier payment'];

export default function PaymentsQueuePage() {
  const me = useUser();
  const toast = useToast();
  const copy = useCopy();
  const { refreshBadges } = useNav();
  const [filter, setFilter] = useState<PaymentStatus | 'all'>('under_review');
  const list = useApi<StaffPayment[]>(`/admin/payments${filter === 'all' ? '' : `?status=${filter}`}`);
  const stats = useApi<{ collectedBdtThisMonth: number; approvedThisMonth: number; pendingReview: number; pendingOverThreeHours: number }>('/admin/payments/stats');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<StaffPayment | null>(null);
  const [reason, setReason] = useState('');

  const isManager = me.role === 'manager';
  const rows = list.data ?? [];

  async function approve(p: StaffPayment) {
    setBusyId(p.id);
    try {
      await apiClient.post(`/admin/payments/${p.id}/approve`);
      toast(`${p.reference} approved — ${fmtNumber(p.credits)} credits added to ${p.client.name}`);
      list.setData((prev) => (prev ?? []).filter((x) => filter === 'all' || x.id !== p.id).map((x) => (x.id === p.id ? { ...x, status: 'approved' } : x)));
      void stats.reload();
      refreshBadges();
    } catch (e) {
      toast(errorMessage(e), 'bad');
      void list.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!rejecting) return;
    if (reason.trim().length < 3) return toast('Add a short reason the client will see.', 'bad');
    setBusyId(rejecting.id);
    try {
      await apiClient.post(`/admin/payments/${rejecting.id}/reject`, { reason: reason.trim() });
      toast(`${rejecting.reference} rejected — the client was emailed`);
      const id = rejecting.id;
      list.setData((prev) => (prev ?? []).filter((x) => filter === 'all' || x.id !== id).map((x) => (x.id === id ? { ...x, status: 'rejected', rejectReason: reason.trim() } : x)));
      setRejecting(null);
      setReason('');
      void stats.reload();
      refreshBadges();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <DashboardTopbar
        title={isManager ? 'Credit requests' : 'Credits & payments'}
        subtitle={isManager ? 'Manual payments from your clients — verify the transfer, then approve' : 'Every payment on the platform'}
        search={false}
      />

      <div className="mb-5.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Collected · this month" value={stats.data ? fmtBdtCompact(stats.data.collectedBdtThisMonth) : '—'} detail={stats.data ? `${fmtNumber(stats.data.approvedThisMonth)} payments` : undefined} detailTone="up" />
        <Stat label="Waiting for review" value={fmtNumber(stats.data?.pendingReview)} detail={stats.data?.pendingOverThreeHours ? `${stats.data.pendingOverThreeHours} over 3 hours` : 'All within 3 hours'} detailTone={stats.data?.pendingOverThreeHours ? 'warn' : undefined} />
        <Stat label="Approved · this month" value={fmtNumber(stats.data?.approvedThisMonth)} />
        <Stat label="Approval limit" value={isManager ? '৳ 10,000' : 'None'} detail={isManager ? 'Larger payments go to an admin' : 'Admins can approve any amount'} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-auth-line px-4.5 py-3">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'under_review', label: `Needs review${stats.data ? ` · ${stats.data.pendingReview}` : ''}` },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>

        {list.error ? (
          <div className="p-4"><ErrorBanner message="Could not load payments." onRetry={() => void list.reload()} /></div>
        ) : list.loading && !list.data ? (
          <div className="grid gap-2 p-4.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title={filter === 'under_review' ? 'You’re all caught up' : 'No payments here'}>
            {filter === 'under_review' ? 'New manual payments appear here, and you get an email for each one.' : 'Try another filter.'}
          </EmptyState>
        ) : (
          <Table head={['Client', 'Payment', 'Method / TrxID', 'Credits', 'Amount', filter === 'under_review' ? 'Waiting' : 'Status', '']}>
            {rows.map((p) => {
              const waitingH = (Date.now() - new Date(p.createdAt).getTime()) / 3_600_000;
              const blocked = isManager && p.needsAdmin;
              return (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.client.name} size={28} />
                      <div className="min-w-0">
                        <div className="truncate">{p.client.name}</div>
                        <div className="truncate text-xs text-auth-text3">{p.client.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="font-mono text-[12.5px]">{p.reference}</span>
                    <small className="block text-xs text-auth-text3">{fmtDateTime(p.createdAt)}</small>
                  </td>
                  <td>
                    {p.methodLabel}
                    {p.transactionId && (
                      <button
                        className="block font-mono text-xs text-auth-text3 hover:text-auth-text"
                        title="Copy transaction ID"
                        onClick={async () => toast((await copy(p.transactionId!)) ? 'Transaction ID copied' : 'Copy failed', 'info')}
                      >
                        {p.transactionId}
                      </button>
                    )}
                    {p.senderNumber && <small className="block text-xs text-auth-text3">from {p.senderNumber}</small>}
                  </td>
                  <td className="font-mono">{fmtNumber(p.credits)}</td>
                  <td className="font-mono whitespace-nowrap">{fmtMoney(p.amount, p.currency)}</td>
                  <td className="whitespace-nowrap">
                    {p.status === 'under_review' ? (
                      <span className={cn('text-[12.5px]', waitingH > 3 ? 'text-auth-warn' : 'text-auth-text3')}>{relativeTime(p.createdAt)}</span>
                    ) : (
                      <>
                        <Pill tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Pill>
                        {p.rejectReason && <small className="mt-1 block max-w-[200px] truncate text-xs text-auth-text3" title={p.rejectReason}>{p.rejectReason}</small>}
                      </>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {(p.status === 'under_review' || p.status === 'pending') &&
                      (blocked ? (
                        <Pill tone="info" dot={false}>Needs admin</Pill>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => setRejecting(p)}>Reject</Button>
                          <Button size="sm" variant="primary" className="ml-2" loading={busyId === p.id} onClick={() => void approve(p)}>Approve</Button>
                        </>
                      ))}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={`Reject ${rejecting?.reference ?? ''}`}
        width={480}
        footer={
          <>
            <Button onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" loading={busyId === rejecting?.id} onClick={() => void reject()}>Reject payment</Button>
          </>
        }
      >
        <p className="mb-3.5 text-[13px] text-auth-text2">
          {rejecting?.client.name} will be emailed this reason. No credits are added. They can submit again with the correct details.
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {REJECT_REASONS.map((r) => (
            <button key={r} onClick={() => setReason(r)} className="rounded-full border border-auth-line px-2.5 py-1 text-xs text-auth-text2 hover:border-auth-line2">{r}</button>
          ))}
        </div>
        <Field label="Reason" className="mb-0">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20" />
        </Field>
      </Modal>
    </>
  );
}
