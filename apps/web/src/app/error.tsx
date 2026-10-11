'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/** Route-level error boundary: a crash in one page shows this instead of a blank screen. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-auth-bg px-6 text-auth-text">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mb-6 text-auth-text2">
          This page hit an unexpected error. Your data is safe — try again, and if it keeps happening, contact support
          {error.digest ? (
            <>
              {' '}with reference <code className="font-mono text-auth-text">{error.digest}</code>
            </>
          ) : null}
          .
        </p>
        <div className="flex justify-center gap-3">
          <button onClick={reset} className="rounded-md bg-auth-accent px-4 py-2 text-sm font-medium text-white hover:bg-auth-accent2">Try again</button>
          <Link href="/" className="rounded-md border border-auth-line2 px-4 py-2 text-sm hover:bg-auth-surface2">Go to dashboard</Link>
        </div>
      </div>
    </main>
  );
}
