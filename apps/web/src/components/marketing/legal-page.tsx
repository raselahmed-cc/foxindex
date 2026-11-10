import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteNav } from '@/components/marketing/site-nav';

/** Shared frame for the privacy policy and terms: marketing header, readable column, footer. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-auth-bg text-auth-text">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <SiteNav />
        <article className="mx-auto max-w-[760px] py-12 text-[15px] leading-relaxed text-auth-text2 [&_a]:text-auth-accent [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-auth-text [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-auth-text [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:text-auth-text [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          <h1 className="text-3xl font-semibold tracking-tight text-auth-text sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-auth-text3">Last updated {updated}</p>
          {children}
        </article>
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-auth-line py-8 text-sm text-auth-text3">
          <span>© {new Date().getFullYear()} FoxIndex</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-5">
            <Link href="/privacy" className="hover:text-auth-text">Privacy</Link>
            <Link href="/terms" className="hover:text-auth-text">Terms</Link>
            <Link href="/" className="hover:text-auth-text">Home</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
