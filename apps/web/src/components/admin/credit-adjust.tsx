'use client';

import { useState } from 'react';
import { Button, Field, Input, Segmented } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { fmtNumber } from '@/lib/format';

export interface CreditLimits {
  maxPerAdjustment: number | null;
  dailyLimit: number | null;
  usedToday: number;
  canDeduct: boolean;
}

/** Add or remove credits for one client, within the signed-in staff member's limits. */
export function CreditAdjustForm({
  userId,
  userName,
  balance,
  onDone,
}: {
  userId: string;
  userName: string;
  balance: number;
  onDone: (balance: number) => void;
}) {
  const toast = useToast();
  const limits = useApi<CreditLimits>('/admin/credits/limits');
  const [direction, setDirection] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const l = limits.data;
  const n = Number(amount || 0);
  const remainingToday = l?.dailyLimit != null ? Math.max(0, l.dailyLimit - l.usedToday) : null;
  const problem =
    n <= 0
      ? null
      : l?.maxPerAdjustment != null && n > l.maxPerAdjustment
        ? `Your limit is ${fmtNumber(l.maxPerAdjustment)} per adjustment`
        : remainingToday !== null && n > remainingToday
          ? `Only ${fmtNumber(remainingToday)} left of your daily limit`
          : direction === 'deduct' && n > balance
            ? `${userName.split(' ')[0]} only has ${fmtNumber(balance)} credits`
            : null;

  async function submit() {
    setBusy(true);
    try {
      const res = await apiClient.post<{ balance: number }>(`/admin/credits/users/${userId}/adjust`, { direction, amount: n, reason: reason.trim() });
      onDone(res.balance);
      toast(direction === 'add' ? `Added ${fmtNumber(n)} credits` : `Removed ${fmtNumber(n)} credits`);
      setAmount('');
      setReason('');
      void limits.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {l?.canDeduct !== false && (
        <div className="mb-3">
          <Segmented value={direction} onChange={setDirection} options={[{ value: 'add', label: 'Add credits' }, { value: 'deduct', label: 'Remove credits' }]} />
        </div>
      )}
      <div className="grid gap-x-2 sm:grid-cols-[120px_1fr]">
        <Field label="Credits" error={problem}>
          <Input mono inputMode="numeric" placeholder="1,000" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} />
        </Field>
        <Field label="Reason" hint="Shown to the client and in the ledger">
          <Input
            placeholder={direction === 'add' ? 'e.g. bKash payment BJK7X2R4P1' : 'e.g. Duplicate top-up reversed'}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-auth-text3">
          {l
            ? l.maxPerAdjustment === null
              ? 'No limit for your role'
              : `Up to ${fmtNumber(l.maxPerAdjustment)} per adjustment${remainingToday !== null ? ` · ${fmtNumber(remainingToday)} left today` : ''}`
            : ''}
        </span>
        <Button
          variant={direction === 'deduct' ? 'danger' : 'primary'}
          loading={busy}
          disabled={n <= 0 || reason.trim().length < 3 || problem !== null}
          onClick={() => void submit()}
        >
          {direction === 'add' ? 'Add' : 'Remove'} {n > 0 ? fmtNumber(n) : ''} credits
        </Button>
      </div>
    </div>
  );
}
