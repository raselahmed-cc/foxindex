'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNav } from '@/lib/nav-context';
import { isActivePath } from '@/lib/navigation';
import { NotificationBell } from '@/components/dash/notification-bell';

export function DashboardTopbar({
  title,
  subtitle,
  action,
  crumb,
  search = true,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  crumb?: ReactNode;
  search?: boolean;
}) {
  const pathname = usePathname();
  const { groups } = useNav();
  const tabs = groups.flatMap((g) => g.items);

  return (
    <>
      <div className="flex min-h-15 flex-wrap items-center justify-between gap-3.5 border-b border-auth-line py-2 md:mb-6">
        <div className="min-w-0">
          {crumb && <div className="text-[12.5px] text-auth-text3">{crumb}</div>}
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && <div className="text-[12.5px] text-auth-text3">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2.5">
          {search && (
            <div className="relative hidden w-70 lg:block">
              <span className="pointer-events-none absolute top-1/2 left-3 h-3 w-3 -translate-y-1/2 rounded-full border-[1.5px] border-auth-text3" />
              <input
                placeholder="Find a URL or site"
                aria-label="Search"
                className="w-full rounded-md border border-auth-line bg-auth-surface py-2 pr-3 pl-8 text-sm text-auth-text outline-none placeholder:text-auth-text3 focus:border-auth-accent focus:ring-3 focus:ring-auth-accent-soft"
              />
            </div>
          )}
          <NotificationBell />
          {action}
        </div>
      </div>

      <nav aria-label="Sections" className="mt-4.5 mb-4.5 flex gap-1.5 overflow-x-auto md:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full border px-3 py-1.5 text-[13px] whitespace-nowrap ${
              isActivePath(pathname, tab.href) ? 'border-transparent bg-auth-accent-soft text-auth-text' : 'border-auth-line text-auth-text2'
            }`}
          >
            {tab.short ?? tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
