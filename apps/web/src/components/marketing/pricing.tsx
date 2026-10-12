'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Pack {
  id: string;
  name: string;
  credits: number;
  priceBdt: number;
  priceUsd: number;
  isFeatured: boolean;
}

/** What each tier adds, by position in the catalogue (smallest pack first). */
const TIER_FEATURES = [
  ['Google + 5 more search engines', 'Status for every URL', 'Live chat support'],
  ['Everything in the previous pack', 'CSV and sitemap import', 'Dedicated account manager', 'WhatsApp support'],
  ['Everything in the previous pack', 'REST API and API keys', 'Priority queue'],
  ['Everything in the previous pack', 'Volume pricing', 'Support tickets with SLA'],
];

/** Whole amounts stay whole; per-URL fractions keep enough precision to be meaningful (৳1.98, $0.017). */
function fmt(n: number, currency: 'BDT' | 'USD'): string {
  const symbol = currency === 'BDT' ? '৳' : '$';
  if (n % 1 === 0) return `${symbol}${n.toLocaleString('en-US')}`;
  const digits = n < 0.1 ? 3 : 2;
  return `${symbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

/** Live credit packs from the API, so prices never drift from what checkout charges. */
export function Pricing() {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [currency, setCurrency] = useState<'BDT' | 'USD'>('BDT');

  useEffect(() => {
    fetch(`${API_URL}/api/v1/public/packs`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: Pack[] }) => (j.success && j.data ? setPacks(j.data) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pay per URL, not per month</h2>
          <p className="mt-2 max-w-xl text-auth-text2">Credits never expire. Google costs 1 credit per URL; the other engines are included free. Your account manager can top you up any time.</p>
        </div>
        <div role="radiogroup" aria-label="Currency" className="inline-flex rounded-md border border-auth-line p-0.5 text-sm">
          {(['BDT', 'USD'] as const).map((c) => (
            <button key={c} role="radio" aria-checked={currency === c} onClick={() => setCurrency(c)} className={cn('rounded px-3 py-1', currency === c ? 'bg-auth-accent-soft text-auth-text' : 'text-auth-text3')}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        <p className="rounded-xl border border-auth-line p-6 text-auth-text2">
          Pricing is loading slowly — <Link href="/signup" className="text-auth-accent">create an account</Link> to see every pack.
        </p>
      ) : !packs ? (
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-80 animate-pulse rounded-xl border border-auth-line bg-auth-surface" />)}</div>
      ) : (
        <div className={cn('grid gap-4', packs.length >= 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3')}>
          {packs.map((p, i) => {
            const price = currency === 'BDT' ? p.priceBdt : p.priceUsd;
            return (
              <div key={p.id} className={cn('flex flex-col rounded-xl border p-6', p.isFeatured ? 'border-auth-accent bg-[linear-gradient(180deg,rgba(107,140,255,.08),transparent_60%)]' : 'border-auth-line bg-auth-surface')}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {p.isFeatured && <span className="rounded-full bg-auth-accent-soft px-2.5 py-0.5 text-xs text-auth-accent">Most popular</span>}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight">{fmt(price, currency)}</span>
                  <span className="text-sm text-auth-text3">/ {p.credits.toLocaleString('en-US')} credits</span>
                </div>
                <p className="mt-1 text-sm text-auth-text3">{fmt(price / p.credits, currency)} per URL</p>
                <ul className="mt-5 mb-6 grid gap-2 text-sm text-auth-text2">
                  {(TIER_FEATURES[Math.min(i, TIER_FEATURES.length - 1)] ?? []).map((f) => (
                    <li key={f} className="flex gap-2"><span className="text-auth-ok">✓</span>{f}</li>
                  ))}
                </ul>
                <Link href="/signup" className={cn('mt-auto rounded-md px-4 py-2.5 text-center text-sm font-medium', p.isFeatured ? 'bg-auth-accent text-white hover:bg-auth-accent2' : 'border border-auth-line2 hover:bg-auth-surface2')}>
                  Get {p.name}
                </Link>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-sm text-auth-text3">Pay with bKash, Nagad, Rocket, card or bank transfer.</p>
    </>
  );
}
