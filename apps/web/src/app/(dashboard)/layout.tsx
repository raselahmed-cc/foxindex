'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) {
      router.replace('/login');
    }
  }, [isPending, session, router]);

  if (isPending) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!session) {
    // Redirect effect above is in flight — render nothing rather than flash protected content.
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <Link href="/" className="font-semibold">
          FoxIndex
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{session.user.email}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              router.push('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
