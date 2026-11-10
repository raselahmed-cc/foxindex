'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FoxLogo } from '@/components/fox-logo';
import { Avatar, Pill } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { NotificationBell } from '@/components/dash/notification-bell';
import { useAccount } from '@/lib/account-context';
import { useNav } from '@/lib/nav-context';
import { isActivePath, type NavItem } from '@/lib/navigation';
import type { Role } from '@/lib/api-types';
import { fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<Exclude<Role, 'client'>, { tone: 'info' | 'bad'; label: string }> = {
  manager: { tone: 'info', label: 'Manager' },
  admin: { tone: 'info', label: 'Admin' },
  superadmin: { tone: 'bad', label: 'Superadmin' },
};

/** The four pages each role opens most — the rest live in the menu. */
const PRIMARY: Record<Role, string[]> = {
  client: ['/dashboard', '/submit', '/urls', '/chat'],
  manager: ['/admin/users', '/chat', '/tickets', '/admin/credits'],
  admin: ['/admin', '/admin/users', '/tickets', '/admin/credits'],
  superadmin: ['/admin', '/admin/users', '/tickets', '/admin/credits'],
};

function Badge({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn('flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-auth-fox px-1.25 text-[10.5px] leading-none font-semibold text-[#1a1208]', className)}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3.5 6h13M3.5 10h13M3.5 14h8" />}
    </svg>
  );
}

/** Four dots — distinct from the list icon the URLs tab uses. */
function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="6" r="1.9" />
      <circle cx="14" cy="6" r="1.9" />
      <circle cx="6" cy="14" r="1.9" />
      <circle cx="14" cy="14" r="1.9" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
      <path d="M6 14H3.5A1.5 1.5 0 012 12.5v-9A1.5 1.5 0 013.5 2H6M10.5 11.5L14 8l-3.5-3.5M14 8H6" />
    </svg>
  );
}

/**
 * Phone navigation: a slim top bar, a bottom tab bar with the role's four main
 * pages, and a full menu that slides in from the left. Hidden from md up,
 * where the sidebar takes over.
 */
export function MobileNav({ role, name, homeHref, onSignOut }: { role: Role; name: string; homeHref: string; onSignOut: () => void }) {
  const pathname = usePathname();
  const { groups, badges } = useNav();
  const { credits, profile } = useAccount();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const isClient = role === 'client';
  const roleLabel = isClient ? null : ROLE_LABEL[role];
  const items = groups.flatMap((g) => g.items);
  const primary = PRIMARY[role].map((href) => items.find((i) => i.href === href)).filter((i): i is NavItem => Boolean(i));
  const otherUnread = items.filter((i) => !PRIMARY[role].includes(i.href)).reduce((sum, i) => sum + (i.badgeKey ? (badges[i.badgeKey] ?? 0) : 0), 0);
  const subtitle = isClient ? (profile?.manager ? `Account manager: ${profile.manager.name}` : 'Your manager will be assigned soon') : roleLabel?.label;

  useEffect(() => setOpen(false), [pathname]);

  // While the menu is open: lock page scroll, close on Escape, focus the close button.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {/* Top bar */}
      <div className="sticky top-0 z-40 -mx-4 -mt-4 mb-1 flex h-14 items-center justify-between gap-3 border-b border-auth-line/70 bg-auth-bg/85 px-4 backdrop-blur-xl md:hidden">
        <Link href={homeHref} className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
          <FoxLogo className="h-6.5 w-6.5 flex-shrink-0" />
          FoxIndex
          {roleLabel && <Pill tone={roleLabel.tone} className="ml-0.5">{roleLabel.label}</Pill>}
        </Link>
        <div className="flex items-center gap-2">
          {isClient && (
            <Link href="/billing/buy" aria-label="Credits — buy more" className="flex items-center gap-1.5 rounded-full border border-auth-fox/25 bg-auth-fox-soft py-1.25 pr-2.75 pl-2.25 font-mono text-[12.5px] whitespace-nowrap text-auth-fox">
              <Icon.coin className="h-3.5 w-3.5" />
              {credits ? fmtNumber(credits.balance) : '—'}
            </Link>
          )}
          <NotificationBell />
          <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="rounded-full ring-auth-accent focus-visible:ring-2">
            <Avatar name={name} size={32} tone={role === 'manager' ? 'fox' : 'accent'} />
          </button>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 border-t border-auth-line/70 bg-auth-bg2/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-5">
          {primary.map((item) => {
            const IconCmp = Icon[item.icon];
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn('relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[10.5px] font-medium', active ? 'text-auth-text' : 'text-auth-text3')}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-auth-accent" />}
                <span className={cn('relative flex h-7 w-11 items-center justify-center rounded-full transition-colors', active && 'bg-auth-accent-soft text-auth-accent')}>
                  <IconCmp className="h-4.5 w-4.5" />
                  <Badge n={item.badgeKey ? badges[item.badgeKey] : undefined} className="absolute -top-1 -right-0.5" />
                </span>
                {item.short ?? item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className={cn('relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[10.5px] font-medium', open ? 'text-auth-text' : 'text-auth-text3')}>
            <span className="relative flex h-7 w-11 items-center justify-center rounded-full">
              <MoreIcon />
              {otherUnread > 0 && <span className="absolute top-0.5 right-2 h-2 w-2 rounded-full bg-auth-fox ring-2 ring-auth-bg2" aria-label="Unread items in menu" />}
            </span>
            Menu
          </button>
        </div>
      </nav>

      {/* Slide-in menu */}
      <div className={cn('fixed inset-0 z-[60] md:hidden', open ? '' : 'pointer-events-none')} aria-hidden={!open}>
        <div className={cn('absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} onClick={() => setOpen(false)} />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cn(
            'absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col rounded-r-2xl border-r border-auth-line2 bg-auth-bg2 shadow-[30px_0_80px_-20px_rgba(0,0,0,0.9)] transition-transform duration-300 ease-out',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <FoxLogo className="h-6.5 w-6.5" />
              FoxIndex
            </span>
            <button ref={closeRef} type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-auth-text2 hover:bg-auth-surface2 hover:text-auth-text">
              <MenuIcon open />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Profile */}
            <div className="mb-4 rounded-2xl border border-auth-line bg-[linear-gradient(135deg,rgba(107,140,255,0.12),transparent_65%)] p-4">
              <div className="flex items-center gap-3">
                <Avatar name={name} size={44} tone={role === 'manager' ? 'fox' : 'accent'} />
                <div className="min-w-0">
                  <b className="block truncate text-[15px] font-semibold">{name}</b>
                  <span className="block truncate text-[12.5px] text-auth-text3">{subtitle}</span>
                </div>
              </div>
              {isClient && (
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-auth-line pt-3.5">
                  <div>
                    <div className="font-mono text-[26px] leading-none font-semibold tracking-tight">{credits ? fmtNumber(credits.balance) : '—'}</div>
                    <div className="mt-1 text-xs text-auth-text3">credits available</div>
                  </div>
                  <Link href="/billing/buy" className="rounded-full bg-auth-fox px-3.5 py-2 text-[13px] font-semibold text-[#1a1208] hover:bg-auth-fox2">Buy credits</Link>
                </div>
              )}
            </div>

            {/* Every page, grouped like the desktop sidebar */}
            <nav aria-label="All pages">
              {groups.map((group, gi) => (
                <div key={gi} className="mb-3">
                  {group.label && <div className="px-3 pt-1 pb-1.5 text-[11.5px] font-medium text-auth-text3">{group.label}</div>}
                  {group.items
                    .filter((item) => item.href !== '/settings')
                    .map((item) => {
                      const IconCmp = Icon[item.icon];
                      const active = isActivePath(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] transition-colors',
                            active ? 'bg-auth-accent-soft text-auth-text' : 'text-auth-text2 active:bg-auth-surface2',
                          )}
                        >
                          <span className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', active ? 'bg-auth-accent text-white' : 'bg-auth-surface text-auth-text2')}>
                            <IconCmp className="h-4 w-4" />
                          </span>
                          <span className="flex-1">{item.label}</span>
                          <Badge n={item.badgeKey ? badges[item.badgeKey] : undefined} />
                        </Link>
                      );
                    })}
                </div>
              ))}
            </nav>
          </div>

          <div className="border-t border-auth-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] text-auth-text2 active:bg-auth-surface2">
              <Icon.gear className="h-4 w-4" />
              Settings
            </Link>
            {isClient && (
              <Link href="/billing/methods" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] text-auth-text2 active:bg-auth-surface2">
                <Icon.card className="h-4 w-4" />
                Payment methods
              </Link>
            )}
            <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14.5px] text-auth-bad active:bg-auth-bad-soft">
              <SignOutIcon />
              Sign out
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
