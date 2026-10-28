'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { CreditPack, PaymentMethod, Quote } from '@/lib/api-types';
import { fmtMoney, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type Currency = 'BDT' | 'USD';

export interface Selection {
  packId: string | null;
  credits: number | null;
  methodId: string | null;
  currency: Currency;
}

const LOGO: Record<string, { bg: string; text: string; label: string }> = {
  bkash: { bg: '#E2136E', text: '#fff', label: 'bKash' },
  nagad: { bg: '#F6921E', text: '#fff', label: 'Nagad' },
  rocket: { bg: '#8C3494', text: '#fff', label: 'Rocket' },
  card: { bg: '#1A1F71', text: '#fff', label: 'CARD' },
  crypto: { bg: '#26A17B', text: '#fff', label: 'USDT' },
  paypal: { bg: '#003087', text: '#fff', label: 'PayPal' },
  bank: { bg: 'var(--color-auth-surface2)', text: 'var(--color-auth-text2)', label: 'BANK' },
};

export function methodLogoKey(m: Pick<PaymentMethod, 'type' | 'network'>): string {
  if (m.network && LOGO[m.network]) return m.network;
  return LOGO[m.type] ? m.type : 'bank';
}

export function MethodLogo({ method, small }: { method: Pick<PaymentMethod, 'type' | 'network'>; small?: boolean }) {
  const logo = LOGO[methodLogoKey(method)];
  return (
    <span
      className={cn('flex flex-shrink-0 items-center justify-center rounded-[5px] font-bold tracking-wide', small ? 'h-5.5 w-8 text-[9px]' : 'h-6.5 w-9.5 text-[10px]')}
      style={{ background: logo.bg, color: logo.text }}
    >
      {logo.label}
    </span>
  );
}

export function packPrice(pack: CreditPack, currency: Currency): number {
  return Number((currency === 'BDT' ? pack.priceBdt : pack.priceUsd) ?? 0);
}

export function PackGrid({
  packs,
  selection,
  onSelect,
  columns = 3,
}: {
  packs: CreditPack[];
  selection: Selection;
  onSelect: (packId: string) => void;
  columns?: 3 | 4;
}) {
  const base = packs[0];
  const baseRate = base ? packPrice(base, selection.currency) / base.credits : 0;
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', columns === 4 ? 'xl:grid-cols-4' : 'lg:grid-cols-3')}>
      {packs.map((pack) => {
        const price = packPrice(pack, selection.currency);
        const rate = price / pack.credits;
        const saving = baseRate > 0 ? Math.round((1 - rate / baseRate) * 100) : 0;
        const active = selection.packId === pack.id;
        return (
          <button
            key={pack.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(pack.id)}
            className={cn(
              'relative rounded-[10px] border p-4.5 text-left transition-colors',
              active ? 'border-auth-accent bg-auth-accent-soft' : 'border-auth-line bg-auth-bg2 hover:border-auth-line2',
            )}
          >
            {pack.isFeatured && (
              <span className="absolute -top-2.5 left-3.5 rounded-full bg-auth-fox px-2 py-0.5 text-[11px] font-semibold text-[#1a1208]">Most popular</span>
            )}
            <div className="mb-2.5 text-sm font-medium">{pack.name}</div>
            <div className="font-mono text-[24px] leading-none font-semibold tracking-tight">
              {fmtNumber(pack.credits)} <small className="font-sans text-xs font-normal tracking-normal text-auth-text3">credits</small>
            </div>
            <div className="mt-2.5 text-[13px]">
              {fmtMoney(price, selection.currency)}
              <span className="block text-[11.5px] text-auth-text3">· {fmtMoney(Math.round(rate * 100) / 100, selection.currency)} / URL</span>
            </div>
            {saving > 0 && <div className="mt-1 text-xs text-auth-ok">Save {saving}%</div>}
          </button>
        );
      })}
    </div>
  );
}

export function MethodList({
  methods,
  selectedId,
  onSelect,
  layout = 'list',
}: {
  methods: PaymentMethod[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  layout?: 'list' | 'grid';
}) {
  return (
    <div role="radiogroup" aria-label="Payment method" className={cn('grid gap-2', layout === 'grid' && 'md:grid-cols-2')}>
      {methods.map((m) => {
        const active = selectedId === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!m.available}
            onClick={() => onSelect(m.id)}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'border-auth-accent bg-auth-accent-soft' : 'border-auth-line bg-auth-bg2 hover:border-auth-line2',
            )}
          >
            <span className={cn('relative h-4 w-4 flex-shrink-0 rounded-full border-[1.5px]', active ? 'border-auth-accent' : 'border-auth-line2')}>
              {active && <span className="absolute inset-0.75 rounded-full bg-auth-accent" />}
            </span>
            <MethodLogo method={m} />
            <span className="min-w-0 flex-1">
              <b className="block text-[13.5px] font-medium">{m.label}</b>
              <small className="block text-xs text-auth-text3">
                {!m.available ? 'Not available yet' : m.isManual ? `Manual · approved by your manager` : `Instant · ${m.gateway === 'aamarpay' ? 'aamarPay' : m.gateway === 'paypal' ? 'PayPal · USD · saved cards' : 'online'}`}
              </small>
            </span>
            <span className={cn('text-[11.5px] whitespace-nowrap', m.isManual ? 'text-auth-warn' : 'text-auth-text3')}>
              {m.feePercent > 0 ? `+${m.feePercent}%` : m.isManual ? 'a few hours' : 'no fee'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Debounced server-side quote — prices are never computed only in the browser. */
export function useQuote(selection: Selection): { quote: Quote | null; loading: boolean } {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const { packId, credits, methodId, currency } = selection;

  useEffect(() => {
    if (!packId && !(credits && credits >= 100)) {
      setQuote(null);
      return;
    }
    const params = new URLSearchParams({ currency });
    if (packId) params.set('packId', packId);
    else params.set('credits', String(credits));
    if (methodId) params.set('methodId', methodId);

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      apiClient
        .get<Quote>(`/billing/quote?${params}`)
        .then((q) => !cancelled && setQuote(q))
        .catch(() => !cancelled && setQuote(null))
        .finally(() => !cancelled && setLoading(false));
    }, packId ? 0 : 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [packId, credits, methodId, currency]);

  return { quote, loading };
}

export function OrderSummary({
  quote,
  method,
  balance,
  loading,
  children,
}: {
  quote: Quote | null;
  method: PaymentMethod | null;
  balance: number | undefined;
  loading: boolean;
  children?: React.ReactNode;
}) {
  const row = (label: React.ReactNode, value: React.ReactNode, className?: string) => (
    <div className={cn('flex justify-between gap-3 text-[13.5px] text-auth-text2', className)}>
      <span>{label}</span>
      <span className="font-mono text-auth-text">{value}</span>
    </div>
  );
  return (
    <div className={cn('grid gap-2.5 transition-opacity', loading && 'opacity-60')}>
      {quote ? (
        <>
          {row(quote.packName ? `${quote.packName} pack` : 'Custom amount', `${fmtNumber(quote.credits)} credits`)}
          {row('Price', fmtMoney(quote.subtotal, quote.currency))}
          {row(`${method?.label ?? 'Payment'} fee`, fmtMoney(quote.fee, quote.currency))}
          <div className="flex justify-between border-t border-auth-line pt-3 text-[15px] font-semibold">
            <span>Total</span>
            <span className="font-mono">{fmtMoney(quote.total, quote.currency)}</span>
          </div>
          {balance !== undefined && row('Balance after', <span className="text-auth-ok">{fmtNumber(balance + quote.credits)} credits</span>)}
        </>
      ) : (
        <p className="text-[13px] text-auth-text3">Pick a pack or enter at least 100 credits.</p>
      )}
      {children}
    </div>
  );
}
