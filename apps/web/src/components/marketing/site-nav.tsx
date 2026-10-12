'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FoxLogo } from '@/components/fox-logo';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#engines', label: 'Search engines' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * Marketing top bar. Signed-in visitors (valid refresh cookie) get a single
 * "Open dashboard" button instead of Log in / Create account.
 */
export function SiteNav() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    // The session cookie is httpOnly, so ask the API (read-only — doesn't rotate the session).
    fetch(`${API_URL}/api/v1/auth/session`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { data?: { signedIn?: boolean } }) => setSignedIn(Boolean(j.data?.signedIn)))
      .catch(() => setSignedIn(false));
  }, []);

  return (
    <header className="flex items-center justify-between gap-4 py-5">
      <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
        <FoxLogo className="h-7 w-7" />
        FoxIndex
      </Link>
      <nav aria-label="Main" className="hidden gap-7 text-sm text-auth-text2 md:flex">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="hover:text-auth-text">{l.label}</a>
        ))}
      </nav>
      <div className="flex items-center gap-2.5">
        {signedIn ? (
          <Link href="/dashboard" className="rounded-md bg-auth-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-auth-accent2">Open dashboard</Link>
        ) : (
          <>
            <Link href="/login" className="rounded-md border border-auth-line2 px-3.5 py-2 text-sm hover:bg-auth-surface2">Log in</Link>
            <Link href="/signup" className="rounded-md bg-auth-accent px-3.5 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-auth-accent2">Create account</Link>
          </>
        )}
      </div>
    </header>
  );
}
