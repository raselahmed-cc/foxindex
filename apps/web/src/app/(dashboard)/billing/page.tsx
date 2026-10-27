'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, CardHeader, EmptyState, ErrorBanner, Input, Modal, Pill, Select, Skeleton, Table } from '@/components/dash/ui';
import { PAYMENT_STATUS } from '@/lib/billing-labels';
import { MethodList, OrderSummary, PackGrid, useQuote, type Selection } from '@/components/billing/purchase';
import { useAccount } from '@/lib/account-context';
import { apiClient } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { CreditPack, LedgerRow, LedgerType, Payment, PaymentMethod } from '@/lib/api-types';
import { fmtDateTime, fmtMoney, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const LEDGER_LABEL: Record<LedgerType, string> = {
  submission_deduct: 'URL submission',
  manual_add: 'Manual credit added',
  manual_deduct: 'Credit removed by staff',
  refund: 'Refund',
  payment_credit: 'Credit purchase',
  signup_bonus: 'Welcome credits',
};

function ledgerBy(row: LedgerRow): string {
  if (row.performedByName) return row.performedByName;
  if (row.type === 'submission_deduct') return 'You';
  return 'Automatic';
}

function toCsv(rows: LedgerRow[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [['Date', 'Type', 'Description', 'By', 'Credits', 'Balance'].join(',')];
  for (const r of rows) {
    lines.push([new Date(r.createdAt).toISOString(), r.type, esc(r.note ?? LEDGER_LABEL[r.type]), esc(ledgerBy(r)), r.amount, r.balanceAfter].join(','));
  }
  return lines.join('\n');
}

const PAGE = 20;

function LedgerTab() {
  const [range, setRange] = useState<'30' | '90' | 'all'>('30');
  const [type, setType] = useState<LedgerType | ''>('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE) });
    if (range !== 'all') p.set('sinceDays', range);
    if (type) p.set('type', type);
    return p;
  }, [range, type]);

  const load = async (offset: number) => {
    setLoading(true);
    try {
      const p = new URLSearchParams(query);
      p.set('offset', String(offset));
      const res = await apiClient.get<{ rows: LedgerRow[]; total: number }>(`/credits/ledger?${p}`);
      setRows((prev) => (offset === 0 ? res.rows : [...prev, ...res.rows]));
      setTotal(res.total);
      setError(null);
    } catch {
      setError('Could not load your credit history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(0);
  }, [query]);

  async function exportCsv() {
    const p = new URLSearchParams(query);
    p.set('limit', '100');
    const all: LedgerRow[] = [];
    for (let offset = 0; offset < Math.max(total, 1) && offset < 5000; offset += 100) {
      p.set('offset', String(offset));
      const res = await apiClient.get<{ rows: LedgerRow[] }>(`/credits/ledger?${p}`);
      all.push(...res.rows);
      if (res.rows.length < 100) break;
    }
    const blob = new Blob([toCsv(all)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foxindex-credits-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-auth-line px-4.5 py-2">
        <Select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="w-auto py-1.25 text-[12.5px]">
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
        <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as LedgerType | '')} className="w-auto py-1.25 text-[12.5px]">
          <option value="">All types</option>
          {Object.entries(LEDGER_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Button size="sm" onClick={() => void exportCsv()} disabled={total === 0}>Export CSV</Button>
      </div>
      {error && <div className="p-4"><ErrorBanner message={error} onRetry={() => void load(0)} /></div>}
      {!error && rows.length === 0 && !loading ? (
        <EmptyState title="No credit activity yet">Purchases, manual credits and submissions will show up here.</EmptyState>
      ) : (
        <Table head={['Date', 'Description', 'By', <span key="c" className="block text-right">Credits</span>, <span key="b" className="block text-right">Balance</span>]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-auth-text3">{fmtDateTime(r.createdAt)}</td>
              <td>
                {LEDGER_LABEL[r.type]}
                {r.note && <small className="block max-w-[340px] truncate text-xs text-auth-text3">{r.note}</small>}
              </td>
              <td className="whitespace-nowrap text-auth-text3">{ledgerBy(r)}</td>
              <td className={cn('text-right font-mono font-medium whitespace-nowrap', r.amount > 0 ? 'text-auth-ok' : 'text-auth-text2')}>
                {r.amount > 0 ? '+' : '−'}
                {fmtNumber(Math.abs(r.amount))}
              </td>
              <td className="text-right font-mono">{fmtNumber(r.balanceAfter)}</td>
            </tr>
          ))}
          {loading && rows.length === 0 &&
            Array.from({ length: 4 }, (_, i) => (
              <tr key={i}>
                <td colSpan={5}><Skeleton className="h-5" /></td>
              </tr>
            ))}
        </Table>
      )}
      <div className="flex items-center justify-between border-t border-auth-line px-4.5 py-3 text-[12.5px] text-auth-text3">
        <span>Showing {fmtNumber(rows.length)} of {fmtNumber(total)} entries</span>
        {rows.length < total && (
          <Button variant="link" onClick={() => void load(rows.length)} disabled={loading}>Load more</Button>
        )}
      </div>
    </>
  );
}

function Receipt({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const { profile } = useAccount();
  return (
    <Modal
      open={payment !== null}
      onClose={onClose}
      title={`Receipt ${payment?.reference ?? ''}`}
      footer={<Button variant="primary" onClick={() => window.print()}>Print / save as PDF</Button>}
    >
      {payment && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-auth-text3">Billed to</dt>
          <dd className="text-right">{profile?.company || profile?.name}</dd>
          <dt className="text-auth-text3">Reference</dt>
          <dd className="text-right font-mono">{payment.reference}</dd>
          <dt className="text-auth-text3">Date</dt>
          <dd className="text-right">{fmtDateTime(payment.reviewedAt ?? payment.createdAt)}</dd>
          <dt className="text-auth-text3">Method</dt>
          <dd className="text-right">{payment.methodLabel}</dd>
          {payment.transactionId && (
            <>
              <dt className="text-auth-text3">Transaction ID</dt>
              <dd className="text-right font-mono">{payment.transactionId}</dd>
            </>
          )}
          <dt className="text-auth-text3">Credits</dt>
          <dd className="text-right font-mono">{fmtNumber(payment.credits)}</dd>
          <dt className="border-t border-auth-line pt-2 font-semibold">Total paid</dt>
          <dd className="border-t border-auth-line pt-2 text-right font-mono font-semibold">{fmtMoney(payment.amount, payment.currency)}</dd>
        </dl>
      )}
    </Modal>
  );
}

function PaymentsTab({ onlyApproved }: { onlyApproved?: boolean }) {
  const { data, error, loading, reload } = useApi<Payment[]>('/billing/payments');
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const rows = (data ?? []).filter((p) => !onlyApproved || p.status === 'approved');

  if (error) return <div className="p-4"><ErrorBanner message="Could not load payments." onRetry={() => void reload()} /></div>;
  if (!loading && rows.length === 0) {
    return <EmptyState title={onlyApproved ? 'No invoices yet' : 'No payments yet'}>Receipts appear here once a payment is confirmed.</EmptyState>;
  }
  return (
    <>
      <Table head={['Date', 'Reference', 'Method', 'Credits', 'Amount', 'Status', '']}>
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="whitespace-nowrap text-auth-text3">{fmtDateTime(p.createdAt)}</td>
            <td className="font-mono text-[12.5px]">{p.reference}</td>
            <td>
              {p.methodLabel}
              {p.transactionId && <small className="block font-mono text-xs text-auth-text3">{p.transactionId}</small>}
            </td>
            <td className="font-mono">{fmtNumber(p.credits)}</td>
            <td className="font-mono whitespace-nowrap">{fmtMoney(p.amount, p.currency)}</td>
            <td>
              <Pill tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Pill>
              {p.rejectReason && <small className="mt-1 block max-w-[220px] text-xs text-auth-text3">{p.rejectReason}</small>}
            </td>
            <td className="text-right">
              {p.status === 'approved' && <Button variant="link" onClick={() => setReceipt(p)}>Receipt</Button>}
            </td>
          </tr>
        ))}
      </Table>
      <Receipt payment={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const { profile, credits } = useAccount();
  const packs = useApi<CreditPack[]>('/billing/packs');
  const methods = useApi<PaymentMethod[]>('/billing/methods');
  const recent = useApi<Payment[]>('/billing/payments');
  const [tab, setTab] = useState<'ledger' | 'payments' | 'invoices'>('ledger');
  const [selection, setSelection] = useState<Selection>({ packId: null, credits: null, methodId: null, currency: 'BDT' });
  const [customInput, setCustomInput] = useState('');

  const visiblePacks = (packs.data ?? []).slice(0, 3);
  useEffect(() => {
    if (!selection.packId && !selection.credits && packs.data?.length) {
      const featured = packs.data.find((p) => p.isFeatured) ?? packs.data[0];
      setSelection((s) => ({ ...s, packId: featured.id }));
    }
  }, [packs.data, selection.packId, selection.credits]);
  useEffect(() => {
    if (!selection.methodId && methods.data?.length) {
      const first = methods.data.find((m) => m.available);
      if (first) setSelection((s) => ({ ...s, methodId: first.id }));
    }
  }, [methods.data, selection.methodId]);

  const { quote, loading: quoting } = useQuote(selection);
  const method = methods.data?.find((m) => m.id === selection.methodId) ?? null;
  const threshold = profile?.preferences.lowBalanceThreshold ?? 200;
  const managerFirst = profile?.manager?.name.split(' ')[0] ?? 'your manager';

  function goToCheckout() {
    const p = new URLSearchParams({ currency: selection.currency });
    if (selection.packId) p.set('pack', selection.packId);
    if (selection.credits) p.set('credits', String(selection.credits));
    if (selection.methodId) p.set('method', selection.methodId);
    router.push(`/billing/buy?${p}`);
  }

  return (
    <>
      <DashboardTopbar
        title="Credits & billing"
        subtitle="1 credit = 1 URL to Google · Bing, Yandex & other engines are always free · credits never expire"
        search={false}
        action={
          <Link href="/chat" className="rounded-md border border-auth-line2 px-3.5 py-2 text-[13.5px] font-medium whitespace-nowrap hover:bg-auth-surface2">
            Ask {managerFirst} to add credit
          </Link>
        }
      />

      <div className="mb-5.5 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Card className="grid items-center gap-4.5 bg-[linear-gradient(120deg,rgba(242,140,59,.10),transparent_55%)] p-5.5 md:grid-cols-[1fr_auto]">
            <div>
              <div className="font-mono text-[44px] leading-none font-semibold tracking-tighter">{credits ? fmtNumber(credits.balance) : '—'}</div>
              <div className="mt-2 text-[13px] text-auth-text3">credits available · about {fmtNumber(credits?.balance ?? 0)} more URLs to Google</div>
              <div className="mt-4 flex flex-wrap gap-5.5 text-[12.5px] text-auth-text3">
                {[
                  [fmtNumber(credits?.usedAllTime ?? 0), 'used all time'],
                  [fmtNumber(credits?.usedThisWeek ?? 0), 'used this week'],
                  [credits?.daysLeft ? `~${credits.daysLeft} days` : '—', 'at current pace'],
                  [`+${fmtNumber(credits?.refunded ?? 0)}`, 'refunded'],
                ].map(([v, l]) => (
                  <div key={l}>
                    <b className="block font-mono text-[15px] font-medium text-auth-text">{v}</b>
                    {l}
                  </div>
                ))}
              </div>
            </div>
            <div className="max-w-60 rounded-lg border border-auth-line bg-auth-surface p-3.5 text-[12.5px] text-auth-text2">
              <b className="mb-1 block font-medium text-auth-text">Low-balance alert at {fmtNumber(threshold)}</b>
              We&apos;ll email and WhatsApp you before you run out.{' '}
              <Link href="/settings#notifications" className="text-auth-accent">Change</Link>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Buy credits"
              right={
                <span className="text-[12.5px] text-auth-text3">
                  Prices in {selection.currency} ·{' '}
                  <button className="text-auth-accent" onClick={() => setSelection((s) => ({ ...s, currency: s.currency === 'BDT' ? 'USD' : 'BDT' }))}>
                    show {selection.currency === 'BDT' ? 'USD' : 'BDT'}
                  </button>
                </span>
              }
            />
            <div className="p-4.5">
              {packs.error ? (
                <ErrorBanner message="Could not load credit packs." onRetry={() => void packs.reload()} />
              ) : packs.loading ? (
                <Skeleton className="h-32" />
              ) : (
                <PackGrid
                  packs={visiblePacks}
                  selection={selection}
                  onSelect={(packId) => {
                    setCustomInput('');
                    setSelection((s) => ({ ...s, packId, credits: null }));
                  }}
                />
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-dashed border-auth-line2 px-3.5 py-3 text-[13.5px] text-auth-text2">
                <label htmlFor="custom-credits">Custom amount</label>
                <Input
                  id="custom-credits"
                  inputMode="numeric"
                  mono
                  placeholder="1,500"
                  value={customInput}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
                    setCustomInput(digits ? Number(digits).toLocaleString('en-US') : '');
                    setSelection((s) => ({ ...s, packId: digits ? null : s.packId, credits: digits ? Number(digits) : null }));
                  }}
                  className="w-32"
                />
                credits
                <span className="ml-auto text-[12.5px] text-auth-text3">
                  {selection.credits && quote && !quote.packId ? (
                    <>= <b className="font-mono font-medium text-auth-text">{fmtMoney(quote.subtotal, quote.currency)}</b> at {fmtMoney(quote.rate, quote.currency)}/URL</>
                  ) : selection.credits && selection.credits < 100 ? (
                    'Minimum 100 credits'
                  ) : null}
                </span>
              </div>

              <div className="mt-5.5 mb-2.5 text-sm font-medium">Pay with</div>
              {methods.error ? (
                <ErrorBanner message="Could not load payment methods." onRetry={() => void methods.reload()} />
              ) : (
                <MethodList methods={methods.data ?? []} selectedId={selection.methodId} onSelect={(methodId) => setSelection((s) => ({ ...s, methodId }))} />
              )}
            </div>
          </Card>
        </div>

        <div className="grid gap-4 xl:sticky xl:top-5">
          <Card>
            <CardHeader title="Order summary" />
            <div className="p-4.5">
              <OrderSummary quote={quote} method={method} balance={credits?.balance} loading={quoting}>
                <Button variant="primary" size="lg" className="mt-1 w-full" disabled={!quote || !method} onClick={goToCheckout}>
                  {quote ? `Pay ${fmtMoney(quote.total, quote.currency)} with ${method?.label ?? '…'}` : 'Choose an amount'}
                </Button>
                <p className="text-center text-xs text-auth-text3">
                  {method?.isManual ? 'You’ll get transfer details and enter your transaction ID next.' : 'You’ll be redirected to the payment page and back.'}
                </p>
              </OrderSummary>
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent payments" right={<button className="text-[12.5px] text-auth-accent" onClick={() => setTab('payments')}>All</button>} />
            {(recent.data ?? []).slice(0, 3).map((p) => (
              <div key={p.id} className="flex justify-between gap-2.5 border-t border-auth-line px-4.5 py-2.5 text-[13px] first:border-t-0">
                <div className="min-w-0">
                  <b className="font-medium">+{fmtNumber(p.credits)} · {p.methodLabel}</b>
                  <div className="truncate text-xs text-auth-text3">{p.reference} · {fmtMoney(p.amount, p.currency)}</div>
                </div>
                <Pill tone={PAYMENT_STATUS[p.status].tone} className="self-start">{PAYMENT_STATUS[p.status].label}</Pill>
              </div>
            ))}
            {recent.data?.length === 0 && <p className="px-4.5 py-4 text-[13px] text-auth-text3">No payments yet.</p>}
          </Card>

          <Card className="p-4.5 text-[13px] leading-relaxed text-auth-text2">
            <b className="mb-1 block font-medium text-auth-text">Need an invoice or a bigger pack?</b>
            {profile?.manager ? profile.manager.name : 'Your manager'} can issue a company invoice and add credit manually after bank transfer.{' '}
            <Link href="/chat" className="text-auth-accent">Message {managerFirst}</Link>
          </Card>
        </div>
      </div>

      <Card>
        <div role="tablist" className="flex gap-0.5 overflow-x-auto border-b border-auth-line px-4.5">
          {([
            ['ledger', 'Credit history'],
            ['payments', 'Payments'],
            ['invoices', 'Invoices'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn('-mb-px border-b-2 px-3 py-3 text-[13.5px] whitespace-nowrap', tab === key ? 'border-auth-accent text-auth-text' : 'border-transparent text-auth-text3 hover:text-auth-text2')}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'ledger' ? <LedgerTab /> : <PaymentsTab onlyApproved={tab === 'invoices'} />}
      </Card>
    </>
  );
}
