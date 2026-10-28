'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, CardHeader, ErrorBanner, Field, Input, Modal, Pill, Segmented, Skeleton, useCopy } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { MethodList, OrderSummary, PackGrid, useQuote, type Currency, type Selection } from '@/components/billing/purchase';
import { useAccount } from '@/lib/account-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { PAYMENT_STATUS } from '@/lib/billing-labels';
import type { CreditPack, Payment, PaymentMethod, SavedMethod } from '@/lib/api-types';
import { fmtDateTime, fmtMoney, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const SLIDER_MIN = 100;
const SLIDER_MAX = 10_000;

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Choose amount', 'Payment method', 'Pay'];
  return (
    <div className="mb-4.5 flex items-center gap-2 text-[13px] text-auth-text3">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const now = n === step;
        return (
          <div key={label} className="contents">
            {i > 0 && <span className="h-px min-w-5 flex-1 bg-auth-line" />}
            <span className={cn('flex items-center gap-2 whitespace-nowrap', now && 'text-auth-text')}>
              <i className={cn('flex h-5.5 w-5.5 items-center justify-center rounded-full font-mono text-[11.5px] font-semibold not-italic', done ? 'bg-auth-ok-soft text-auth-ok' : now ? 'bg-auth-accent text-white' : 'bg-auth-surface2')}>
                {done ? <Icon.check className="h-3 w-3" /> : n}
              </i>
              <span className="hidden sm:inline">{label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string | null }) {
  const copy = useCopy();
  const toast = useToast();
  if (!value) return null;
  return (
    <>
      <dt className="text-auth-text3">{label}</dt>
      <dd className="font-mono break-all">{value}</dd>
      <button
        type="button"
        className="text-xs text-auth-accent"
        onClick={async () => toast((await copy(value)) ? `${label} copied` : 'Copy failed', 'info')}
      >
        Copy
      </button>
    </>
  );
}

function ResultModal({ reference, result, onClose }: { reference: string; result: string; onClose: () => void }) {
  const { refreshCredits, credits, profile } = useAccount();
  const [payment, setPayment] = useState<Payment | null>(null);

  useEffect(() => {
    apiClient.get<Payment>(`/billing/payments/${reference}`).then(setPayment).catch(() => setPayment(null));
    void refreshCredits();
  }, [reference, refreshCredits]);

  const approved = payment?.status === 'approved' || result === 'approved';
  const underReview = payment?.status === 'under_review' || result === 'submitted' || result === 'pending';

  return (
    <Modal open onClose={onClose} title={approved ? 'Payment received' : underReview ? 'Payment submitted' : 'Payment not completed'} width={440}>
      <div className="text-center">
        <div className={cn('mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full', approved ? 'bg-auth-ok-soft text-auth-ok' : underReview ? 'bg-auth-warn-soft text-auth-warn' : 'bg-auth-bad-soft text-auth-bad')}>
          {approved ? <Icon.check className="h-7 w-7" /> : <Icon.info className="h-7 w-7" />}
        </div>
        <p className="mb-4.5 text-[13.5px] text-auth-text2">
          {approved
            ? `Your credits are ready to use. A confirmation was emailed to ${profile?.email ?? 'you'}.`
            : underReview
              ? `${profile?.manager?.name ?? 'Your manager'} will verify the transfer — usually within a few hours on working days. You'll get an email when credits land.`
              : 'Nothing was charged. You can try again or pick another method.'}
        </p>
        {payment && (
          <>
            <div className="font-mono text-4xl leading-none font-semibold tracking-tight">
              +{fmtNumber(payment.credits)}
              {approved && credits && <small className="mt-1.5 block font-sans text-[12.5px] font-normal tracking-normal text-auth-text3">new balance {fmtNumber(credits.balance)} credits</small>}
            </div>
            <dl className="my-4.5 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-auth-bg2 px-3.5 py-3 text-left text-[12.5px]">
              <dt className="text-auth-text3">Reference</dt>
              <dd className="text-right font-mono">{payment.reference}</dd>
              <dt className="text-auth-text3">Method</dt>
              <dd className="text-right">{payment.methodLabel}</dd>
              <dt className="text-auth-text3">Amount</dt>
              <dd className="text-right font-mono">{fmtMoney(payment.amount, payment.currency)}</dd>
              {payment.transactionId && (
                <>
                  <dt className="text-auth-text3">Transaction ID</dt>
                  <dd className="text-right font-mono">{payment.transactionId}</dd>
                </>
              )}
              <dt className="text-auth-text3">Status</dt>
              <dd className="text-right">
                <Pill tone={PAYMENT_STATUS[payment.status].tone}>{PAYMENT_STATUS[payment.status].label}</Pill>
              </dd>
            </dl>
          </>
        )}
        <div className="flex gap-2">
          <Link href="/billing" className="flex-1 rounded-md border border-auth-line2 px-3.5 py-2 text-[13.5px] font-medium hover:bg-auth-surface2">Back to billing</Link>
          {approved ? (
            <Link href="/submit" className="flex-1 rounded-md bg-auth-accent px-3.5 py-2 text-[13.5px] font-medium text-white hover:bg-auth-accent2">Submit URLs</Link>
          ) : (
            <Button variant="primary" className="flex-1" onClick={onClose}>{underReview ? 'Done' : 'Try again'}</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function BuyCredits() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { credits, profile } = useAccount();
  const packs = useApi<CreditPack[]>('/billing/packs');
  const methods = useApi<PaymentMethod[]>('/billing/methods');
  const recent = useApi<Payment[]>('/billing/payments');
  const saved = useApi<SavedMethod[]>('/billing/saved-methods');

  const [selection, setSelection] = useState<Selection>(() => ({
    packId: params.get('pack'),
    credits: params.get('credits') ? Number(params.get('credits')) : null,
    methodId: params.get('method'),
    currency: (params.get('currency') === 'USD' ? 'USD' : 'BDT') as Currency,
  }));
  const [trxId, setTrxId] = useState('');
  const [sender, setSender] = useState('');
  /** PayPal: a saved card/PayPal account id, or 'new' for a fresh PayPal checkout. */
  const [savedId, setSavedId] = useState<string>('new');
  const [saveMethod, setSaveMethod] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; result: string } | null>(() => {
    const ref = params.get('payment');
    return ref ? { reference: ref, result: params.get('result') ?? 'pending' } : null;
  });

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
  const vaulted = useMemo(() => (saved.data ?? []).filter((m) => m.provider === 'paypal'), [saved.data]);
  const isPayPal = method?.gateway === 'paypal';
  const chosenSaved = isPayPal && savedId !== 'new' ? (vaulted.find((m) => m.id === savedId) ?? null) : null;

  // PayPal only settles in US dollars.
  useEffect(() => {
    if (method?.usdOnly && selection.currency !== 'USD') setSelection((s) => ({ ...s, currency: 'USD' }));
  }, [method?.usdOnly, selection.currency]);

  // Start on the client's default saved card/PayPal account when paying by PayPal.
  const preferredVaulted = vaulted.find((m) => m.isDefault)?.id ?? vaulted[0]?.id ?? null;
  useEffect(() => {
    if (isPayPal && preferredVaulted) setSavedId(preferredVaulted);
  }, [isPayPal, preferredVaulted]);

  // Prefill "sent from" with the client's saved wallet/bank details of the same kind.
  const savedSender = method?.isManual
    ? ((saved.data ?? []).filter((m) => m.type === method.type).sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0]?.display ?? null)
    : null;
  useEffect(() => {
    if (savedSender) setSender((cur) => cur || savedSender);
  }, [savedSender]);
  const sliderValue = quote?.credits ?? selection.credits ?? 3000;
  const step: 1 | 2 | 3 = !quote ? 1 : !method ? 2 : method.isManual && trxId.trim().length < 4 ? 2 : 3;

  const sliderPct = useMemo(() => ((Math.min(SLIDER_MAX, sliderValue) - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100, [sliderValue]);

  async function pay() {
    if (!quote || !method) return;
    setFormError(null);
    if (method.isManual && trxId.trim().length < 4) {
      setFormError('Enter the transaction ID from your receipt.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ payment: Payment; redirectUrl: string | null }>('/billing/payments', {
        methodId: method.id,
        currency: selection.currency,
        ...(selection.packId ? { packId: selection.packId } : { credits: quote.credits }),
        ...(method.isManual ? { transactionId: trxId.trim(), senderNumber: sender.trim() || undefined } : {}),
        ...(isPayPal ? (chosenSaved ? { savedMethodId: chosenSaved.id } : { saveMethod }) : {}),
      });
      if (res.redirectUrl) {
        window.location.assign(res.redirectUrl);
        return;
      }
      if (res.payment.status === 'approved') {
        void recent.reload();
        setResult({ reference: res.payment.reference, result: 'approved' });
        return;
      }
      setTrxId('');
      setSender('');
      void recent.reload();
      setResult({ reference: res.payment.reference, result: 'submitted' });
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DashboardTopbar
        title="Buy credits"
        crumb={<><Link href="/billing" className="hover:text-auth-text2">Credits &amp; billing</Link> / Buy credits</>}
        search={false}
        action={
          <>
            <span className="hidden text-[12.5px] text-auth-text3 sm:inline">
              Balance now <b className="font-mono text-auth-text">{credits ? fmtNumber(credits.balance) : '—'}</b>
            </span>
            <Link href="/billing" className="rounded-md border border-auth-line2 px-3.5 py-2 text-[13.5px] font-medium whitespace-nowrap hover:bg-auth-surface2">Back to billing</Link>
          </>
        }
      />

      <div className="grid max-w-[1180px] grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <StepBar step={step} />

          <Card>
            <CardHeader
              title="1 · How many credits?"
              right={
                <Segmented<Currency>
                  value={selection.currency}
                  onChange={(currency) => setSelection((s) => ({ ...s, currency }))}
                  options={[{ value: 'BDT', label: '৳ BDT' }, { value: 'USD', label: '$ USD' }]}
                />
              }
            />
            <div className="p-4.5">
              {packs.error ? (
                <ErrorBanner message="Could not load credit packs." onRetry={() => void packs.reload()} />
              ) : packs.loading ? (
                <Skeleton className="h-36" />
              ) : (
                <PackGrid packs={packs.data ?? []} selection={selection} columns={4} onSelect={(packId) => setSelection((s) => ({ ...s, packId, credits: null }))} />
              )}

              <div className="mt-3.5 rounded-[10px] border border-auth-line bg-auth-bg2 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
                  <label htmlFor="credit-slider">Or pick any amount</label>
                  <b className="font-mono font-medium">
                    {fmtNumber(sliderValue)} credits{quote ? ` · ${fmtMoney(quote.subtotal, quote.currency)}` : ''}
                  </b>
                </div>
                <input
                  id="credit-slider"
                  type="range"
                  min={SLIDER_MIN}
                  max={SLIDER_MAX}
                  step={100}
                  value={Math.min(SLIDER_MAX, sliderValue)}
                  onChange={(e) => setSelection((s) => ({ ...s, packId: null, credits: Number(e.target.value) }))}
                  className="w-full accent-auth-accent"
                  style={{ background: `linear-gradient(to right, var(--color-auth-accent) ${sliderPct}%, var(--color-auth-surface2) ${sliderPct}%)` }}
                />
                <div className="mt-2 flex justify-between font-mono text-[11.5px] text-auth-text3">
                  {[100, 2500, 5000, 7500, 10000].map((t) => <span key={t}>{fmtNumber(t)}</span>)}
                </div>
                {quote && (
                  <div className="mt-2.5 text-[12.5px] text-auth-text2">
                    Rate {fmtMoney(quote.rate, quote.currency)} / URL
                    {quote.nextTier && (
                      <> · buy <b className="font-medium text-auth-ok">{fmtNumber(quote.nextTier.credits)}+</b> to unlock {fmtMoney(quote.nextTier.rate, quote.currency)} / URL</>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="2 · Pay with" right={<span className="hidden text-[12.5px] text-auth-text3 md:inline">Instant methods add credits the moment payment clears</span>} />
            <div className="p-4.5">
              {methods.error ? (
                <ErrorBanner message="Could not load payment methods." onRetry={() => void methods.reload()} />
              ) : (
                <MethodList methods={methods.data ?? []} selectedId={selection.methodId} layout="grid" onSelect={(methodId) => setSelection((s) => ({ ...s, methodId }))} />
              )}
              {methods.data?.some((m) => !m.available) && (
                <p className="mt-2 text-xs text-auth-text3">Online methods turn on once the payment gateway is configured. Bank transfer works now.</p>
              )}

              {method?.isManual && (
                <div className="mt-3.5 rounded-[10px] border border-auth-warn/35 bg-auth-warn-soft p-4">
                  <b className="mb-1.5 block font-medium text-auth-warn">Pay by {method.label.toLowerCase()}</b>
                  <p className="text-[13px] text-auth-text2">
                    Send exactly {quote ? <b className="text-auth-text">{fmtMoney(quote.total, quote.currency)}</b> : 'the total'}, then paste the transaction ID below.{' '}
                    {profile?.manager?.name ?? 'Your manager'} approves manual payments within a few hours on working days.
                    {method.instructions && <> {method.instructions}</>}
                  </p>
                  <dl className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3.5 gap-y-2 rounded-lg border border-auth-line bg-auth-bg px-3.5 py-3 text-[13px]">
                    <CopyRow label="Bank" value={method.bankName ? `${method.bankName}${method.branch ? ` · ${method.branch}` : ''}` : null} />
                    <CopyRow label="Account name" value={method.accountName} />
                    <CopyRow label="Account no." value={method.accountNumber} />
                    <CopyRow label="Narration" value={profile ? `FoxIndex ${profile.email}` : null} />
                  </dl>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Transaction ID / reference" className="mb-0">
                      <Input mono placeholder="e.g. BJK7X2R4P1" value={trxId} onChange={(e) => setTrxId(e.target.value)} maxLength={64} />
                    </Field>
                    <Field label="Sent from (optional)" className="mb-0">
                      <Input placeholder="Account or number you paid from" value={sender} onChange={(e) => setSender(e.target.value)} maxLength={32} />
                    </Field>
                  </div>
                </div>
              )}

              {isPayPal && method?.available && (
                <div className="mt-3.5 rounded-[10px] border border-auth-line bg-auth-bg2 p-4">
                  <b className="mb-1 block font-medium">Pay with PayPal</b>
                  <p className="mb-3 text-[13px] text-auth-text2">Charged in US dollars. Use your PayPal balance or any debit or credit card — card details go to PayPal, never to us.</p>
                  <div role="radiogroup" aria-label="PayPal payment source" className="grid gap-2">
                    {vaulted.map((m) => (
                      <label key={m.id} className={cn('flex items-center gap-3 rounded-lg border p-3 text-[13.5px]', savedId === m.id ? 'border-auth-accent bg-auth-accent-soft' : 'border-auth-line bg-auth-bg')}>
                        <input type="radio" name="pp-source" checked={savedId === m.id} onChange={() => setSavedId(m.id)} className="accent-auth-accent" />
                        <span className="min-w-0 flex-1">
                          <b className="block font-medium">{m.label ?? m.display}</b>
                          <small className="block text-xs text-auth-text3">{m.type === 'card' ? 'Saved card · charged instantly' : `${m.display} · charged instantly`}</small>
                        </span>
                        {m.isDefault && <Pill tone="info">Default</Pill>}
                      </label>
                    ))}
                    <label className={cn('flex items-center gap-3 rounded-lg border p-3 text-[13.5px]', savedId === 'new' ? 'border-auth-accent bg-auth-accent-soft' : 'border-auth-line bg-auth-bg')}>
                      <input type="radio" name="pp-source" checked={savedId === 'new'} onChange={() => setSavedId('new')} className="accent-auth-accent" />
                      <span className="min-w-0 flex-1">
                        <b className="block font-medium">{vaulted.length ? 'Another PayPal account or card' : 'PayPal account or card'}</b>
                        <small className="block text-xs text-auth-text3">You’ll approve the payment on PayPal and come straight back</small>
                      </span>
                    </label>
                  </div>
                  {savedId === 'new' && (
                    <label className="mt-3 flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={saveMethod} onChange={(e) => setSaveMethod(e.target.checked)} className="accent-auth-accent" />
                      Save this PayPal account for one-click top-ups
                    </label>
                  )}
                  <Link href="/billing/methods" className="mt-2.5 inline-block text-[12.5px] text-auth-accent">Manage payment methods →</Link>
                </div>
              )}

              <div className="mt-3.5 flex flex-wrap gap-4 text-xs text-auth-text3">
                {['Payments verified server-side', 'Credits never expire', 'Refunded if a URL can’t be submitted', 'Receipt for every payment'].map((t) => (
                  <span key={t} className="flex items-center gap-1.5"><Icon.check className="h-3.25 w-3.25 text-auth-ok" />{t}</span>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-4 xl:sticky xl:top-5">
          <Card>
            <CardHeader title="Order summary" />
            <div className="p-4.5">
              <OrderSummary quote={quote} method={method} balance={credits?.balance} loading={quoting}>
                {formError && <p role="alert" className="text-[12.5px] text-auth-bad">{formError}</p>}
                <Button variant="primary" size="lg" className="mt-1 w-full" disabled={!quote || !method || !method.available} loading={submitting} onClick={() => void pay()}>
                  {!quote ? 'Choose an amount' : method?.isManual ? `Submit ${fmtMoney(quote.total, quote.currency)} for approval` : chosenSaved ? `Pay ${fmtMoney(quote.total, quote.currency)} with ${chosenSaved.label ?? chosenSaved.display}` : `Pay ${fmtMoney(quote.total, quote.currency)} with ${isPayPal ? 'PayPal' : (method?.label ?? '…')}`}
                </Button>
                <p className="flex items-start justify-center gap-2 text-center text-xs text-auth-text3">
                  <Icon.lock className="mt-0.5 h-3.25 w-3.25 flex-shrink-0" />
                  {method?.isManual ? 'Credits are added once your manager confirms the transfer.' : chosenSaved ? 'Charged right away to your saved method. Credits are added the moment PayPal confirms.' : "You'll be redirected to the payment page and back. Nothing is charged until you confirm there."}
                </p>
              </OrderSummary>
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent payments" right={<Link href="/billing" className="text-[12.5px] text-auth-accent">All</Link>} />
            {(recent.data ?? []).slice(0, 4).map((p) => (
              <div key={p.id} className="flex justify-between gap-2.5 border-t border-auth-line px-4.5 py-2.5 text-[13px] first:border-t-0">
                <div className="min-w-0">
                  <b className="font-medium">+{fmtNumber(p.credits)} · {p.methodLabel}</b>
                  <div className="truncate text-xs text-auth-text3">{p.reference} · {fmtDateTime(p.createdAt)}</div>
                </div>
                <Pill tone={PAYMENT_STATUS[p.status].tone} className="self-start">{PAYMENT_STATUS[p.status].label}</Pill>
              </div>
            ))}
            {recent.data?.length === 0 && <p className="px-4.5 py-4 text-[13px] text-auth-text3">No payments yet.</p>}
          </Card>

          <Card className="p-4.5 text-[13px] leading-relaxed text-auth-text2">
            <b className="mb-1 block font-medium text-auth-text">Buying for a company?</b>
            Add your company name in <Link href="/settings" className="text-auth-accent">Settings</Link> and it appears on every receipt. For 50,000+ credits,{' '}
            <Link href="/chat" className="text-auth-accent">message {profile?.manager?.name.split(' ')[0] ?? 'your manager'}</Link> for a custom rate.
          </Card>
        </div>
      </div>

      {result && (
        <ResultModal
          reference={result.reference}
          result={result.result}
          onClose={() => {
            setResult(null);
            if (params.get('payment')) router.replace('/billing/buy');
            if (result.result === 'failed') toast('Payment not completed — you can try again any time.', 'info');
          }}
        />
      )}
    </>
  );
}

export default function BuyCreditsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-auth-text3">Loading…</div>}>
      <BuyCredits />
    </Suspense>
  );
}
