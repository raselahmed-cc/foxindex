'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const FALLBACK = 10;

let cached: Promise<number> | null = null;

/** Free credits a new account gets — set by the superadmin in the credit policy. */
export function fetchStarterCredits(): Promise<number> {
  cached ??= fetch(`${API_URL}/api/v1/public/pricing`)
    .then((r) => r.json())
    .then((j: { data?: { starterCredits?: number } }) => j.data?.starterCredits ?? FALLBACK)
    .catch(() => {
      cached = null;
      return FALLBACK;
    });
  return cached;
}

export function useStarterCredits(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchStarterCredits().then((v) => alive && setN(v));
    return () => {
      alive = false;
    };
  }, []);
  return n;
}

/** Inline "10" (or whatever the policy says) for server-rendered marketing copy. */
export function StarterCredits() {
  const n = useStarterCredits();
  return <>{n === null ? FALLBACK : n.toLocaleString('en-US')}</>;
}
