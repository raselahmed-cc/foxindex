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

/** Packs differ only in size and price — every account gets all of these. */
const INCLUDED = [
  'Google, Bing, Yandex, Naver, Seznam and Yep in one submission',
  'Status for every URL',
  'CSV import and the REST API',
  'Live chat and WhatsApp with your account manager',
  'Support tickets',
  'Automatic refund when a URL can’t be submitted',
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
  const [perUrl, setPerUrl] = useState(1);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/public/packs`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: Pack[] }) => (j.success && j.data ? setPacks(j.data) : setFailed(true)))
      .catch(() => setFailed(true));
    fetch(`${API_URL}/api/v1/public/pricing`)
      .then((r) => r.json())
      .then((j: { data?: { creditsPerUrl?: number } }) => setPerUrl(Math.max(1, j.data?.creditsPerUrl ?? 1)))
      .catch(() => undefined);
    // Signed-in visitors go straight to checkout with the pack picked; everyone else signs up first.
    fetch(`${API_URL}/api/v1/auth/session`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { data?: { signedIn?: boolean } }) => setSignedIn(Boolean(j.data?.signedIn)))
      .catch(() => setSignedIn(false));
  }, []);

  // Savings are measured against the smallest pack's per-credit price.
  const base = packs?.length ? packs[0] : null;
  const unit = (p: Pack) => (currency === 'BDT' ? p.priceBdt : p.priceUsd) / p.credits;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pay per URL, not per month</h2>
          <p className="mt-2 max-w-xl text-auth-text2">
            {perUrl === 1 ? 'One credit submits one URL' : `${perUrl} credits submit one URL`} to Google and five more search engines. Credits never expire, and bigger packs cost less per URL.
          </p>
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
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-xl border border-auth-line bg-auth-surface" />)}</div>
      ) : (
        <div className={cn('grid gap-4', packs.length >= 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3')}>
          {packs.map((p) => {
            const price = currency === 'BDT' ? p.priceBdt : p.priceUsd;
            const urls = Math.floor(p.credits / perUrl);
            const saving = base && base.id !== p.id && unit(base) > 0 ? Math.round((1 - unit(p) / unit(base)) * 100) : 0;
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
                <p className="mt-1 text-sm text-auth-text3">{fmt(price / Math.max(1, urls), currency)} per URL</p>
                <ul className="mt-5 mb-6 grid gap-2 text-sm text-auth-text2">
                  <li className="flex gap-2"><span className="text-auth-ok">✓</span>{urls.toLocaleString('en-US')} URL submissions</li>
                  <li className="flex gap-2"><span className="text-auth-ok">✓</span>Credits never expire</li>
                  {saving > 0 && <li className="flex gap-2"><span className="text-auth-ok">✓</span>Save {saving}% per URL vs {base?.name}</li>}
                </ul>
                <Link
                  href={signedIn ? `/billing/buy?pack=${p.id}` : '/signup'}
                  className={cn('mt-auto rounded-md px-4 py-2.5 text-center text-sm font-medium', p.isFeatured ? 'bg-auth-accent text-white hover:bg-auth-accent2' : 'border border-auth-line2 hover:bg-auth-surface2')}
                >
                  {signedIn ? `Buy ${p.name}` : `Get ${p.name}`}
                </Link>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-5 rounded-xl border border-auth-line bg-auth-surface p-5">
        <b className="text-sm font-medium">Every pack includes</b>
        <ul className="mt-2.5 grid gap-x-6 gap-y-1.5 text-sm text-auth-text2 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((f) => (
            <li key={f} className="flex gap-2"><span className="text-auth-ok">✓</span>{f}</li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-sm text-auth-text3">
        Pay online with bKash, Nagad, Rocket or card, or pay by bank transfer and your account manager adds the credits once it arrives.
      </p>
    </>
  );
}
