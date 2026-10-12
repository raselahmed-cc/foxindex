'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavContext, type Badges, type NavState } from '@/lib/nav-context';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/use-current-user';
import { UserContext } from '@/lib/user-context';
import { apiClient } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { AccountProvider, useAccount } from '@/lib/account-context';
import { isActivePath, navFor, type NavItem } from '@/lib/navigation';
import type { Conversation, Role } from '@/lib/api-types';
import { fmtNumber } from '@/lib/format';
import { FoxLogo } from '@/components/fox-logo';
import { Avatar, Pill } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { ToastProvider } from '@/components/dash/toast';
import { ChatWidget } from '@/components/chat/chat-widget';
import { RealtimeProvider } from '@/lib/realtime-context';
import { resetChatSocket } from '@/lib/chat-socket';

const ROLE_PILL: Record<Exclude<Role, 'client'>, { tone: 'info' | 'bad'; label: string }> = {
  manager: { tone: 'info', label: 'Manager' },
  admin: { tone: 'info', label: 'Admin' },
  superadmin: { tone: 'bad', label: 'Superadmin' },
};

function NavLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const IconCmp = Icon[item.icon];
  const tone = item.badgeKey === 'pendingPayments' || item.badgeKey === 'pendingApprovals' ? 'bg-auth-warn-soft text-auth-warn' : item.badgeKey === 'unreadChats' ? 'bg-auth-fox-soft text-auth-fox' : 'bg-auth-surface2 text-auth-text2';
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${
        active ? 'bg-auth-accent-soft text-auth-text' : 'text-auth-text2 hover:bg-auth-surface hover:text-auth-text'
      }`}
    >
      <span className={active ? 'text-auth-accent' : 'opacity-75'}>
        <IconCmp />
      </span>
      {item.label}
      {badge ? <span className={`ml-auto rounded-full px-1.75 py-0.25 text-[11.5px] ${tone}`}>{fmtNumber(badge)}</span> : null}
    </Link>
  );
}

function SidebarCredit() {
  const { credits } = useAccount();
  const balance = credits?.balance;
  const low = balance !== undefined && balance < 200;
  return (
    <div className="mt-auto rounded-[10px] border border-auth-line bg-auth-surface p-3.5">
      <div className="font-mono text-2xl leading-none font-semibold tracking-tight">{balance === undefined ? '—' : fmtNumber(balance)}</div>
      <div className="mt-1.25 text-xs text-auth-text3">
        credits · {credits?.daysLeft ? `about ${credits.daysLeft} days left` : `about ${fmtNumber(balance ?? 0)} more URLs`}
      </div>
      <div className="my-3 h-1 overflow-hidden rounded-full bg-auth-surface2">
        <span className={`block h-full rounded-full ${low ? 'bg-auth-warn' : 'bg-auth-accent'}`} style={{ width: `${Math.min(100, ((balance ?? 0) / 3000) * 100)}%` }} />
      </div>
      <Link href="/billing/buy" className="block w-full rounded-md bg-auth-fox-soft py-2 text-center text-sm font-medium text-auth-fox hover:bg-auth-fox/20">
        Buy credits
      </Link>
    </div>
  );
}

function Shell({ children, role, name, userId, onSignOut }: { children: ReactNode; role: Role; name: string; userId: string; onSignOut: () => void }) {
  const pathname = usePathname();
  const { profile } = useAccount();
  const groups = useMemo(() => navFor(role), [role]);
  const [badges, setBadges] = useState<Badges>({});
  const [badgeTick, setBadgeTick] = useState(0);
  const isClient = role === 'client';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next: Badges = {};
      const conversations = await apiClient.get<Conversation[]>('/chat/conversations').catch(() => []);
      next.unreadChats = conversations.reduce((sum, c) => sum + c.unread, 0);
      const tickets = await apiClient.get<{ items: { unread: boolean }[] }>('/tickets?view=open&limit=200').catch(() => null);
      next.unreadTickets = tickets?.items.filter((t) => t.unread).length ?? 0;
      if (!isClient) {
        const [stats, pending] = await Promise.all([
          apiClient.get<{ pendingReview: number }>('/admin/payments/stats').catch(() => null),
          apiClient.get<unknown[]>('/admin/users?status=pending_approval').catch(() => []),
        ]);
        next.pendingPayments = stats?.pendingReview ?? 0;
        next.pendingApprovals = pending.length;
      }
      if (!cancelled) setBadges(next);
    };
    void load();
    const timer = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isClient, badgeTick, pathname]);

  const nav = useMemo<NavState>(() => ({ groups, badges, refreshBadges: () => setBadgeTick((t) => t + 1) }), [groups, badges]);
  const rolePill = role === 'client' ? null : ROLE_PILL[role];

  return (
    <RealtimeProvider meId={userId} role={role} onBadgesStale={nav.refreshBadges}>
    <NavContext.Provider value={nav}>
      <div className="grid min-h-screen grid-cols-1 bg-auth-bg text-auth-text md:grid-cols-[236px_1fr]">
        <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-auth-line bg-auth-bg2 p-3 md:flex">
          <Link href={isClient ? '/dashboard' : role === 'manager' ? '/admin/users' : '/admin'} className="flex items-center gap-2.5 px-2 pt-1.5 pb-4.5 text-base font-semibold">
            <FoxLogo className="h-6.5 w-6.5 flex-shrink-0" />
            FoxIndex
            {rolePill && <Pill tone={rolePill.tone} className="ml-0.5">{rolePill.label}</Pill>}
          </Link>

          <nav className="flex flex-col" aria-label="Main">
            {groups.map((group, gi) => (
              <div key={gi}>
                {group.label && <div className="px-2.5 pt-4 pb-1.5 text-[11px] tracking-wide text-auth-text3">{group.label}</div>}
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActivePath(pathname, item.href)} badge={item.badgeKey ? badges[item.badgeKey] : undefined} />
                ))}
              </div>
            ))}
          </nav>

          {isClient ? <SidebarCredit /> : <div className="mt-auto" />}

          <div className="flex items-center gap-2.5 px-1.5 pt-3.5 text-sm">
            <Avatar name={name} tone={role === 'manager' ? 'fox' : 'accent'} />
            <div className="min-w-0 flex-1">
              <div className="truncate">{name}</div>
              <div className="truncate text-xs text-auth-text3">
                {isClient ? (profile?.manager ? `Manager: ${profile.manager.name}` : 'No manager yet') : rolePill?.label}
              </div>
            </div>
            <button
              onClick={onSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="flex h-7.5 w-7.5 flex-shrink-0 items-center justify-center rounded-md text-auth-text3 hover:bg-auth-surface hover:text-auth-text"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.75 w-3.75" aria-hidden="true">
                <path d="M6 14H3.5A1.5 1.5 0 012 12.5v-9A1.5 1.5 0 013.5 2H6M10.5 11.5L14 8l-3.5-3.5M14 8H6" />
              </svg>
            </button>
          </div>
        </aside>

        <main className="min-w-0 px-4 pt-4 pb-12 md:px-7 md:pt-0">{children}</main>

        {isClient && pathname !== '/chat' && <ChatWidget />}
      </div>
    </NavContext.Provider>
    </RealtimeProvider>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useCurrentUser();
  const role = (user?.role ?? 'client') as Role;

  // Route guard: staff-only areas for staff, client-only areas for clients. The API enforces this too.
  useEffect(() => {
    if (!user) return;
    if (role === 'client' && pathname.startsWith('/admin')) router.replace('/dashboard');
    else if (role === 'manager' && pathname === '/admin') router.replace('/admin/users');
    else if (role !== 'client' && pathname === '/dashboard') router.replace(role === 'manager' ? '/admin/users' : '/admin');
  }, [user, role, pathname, router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-auth-bg text-sm text-auth-text3">Loading…</div>;
  }
  if (!user) return null;

  async function handleSignOut() {
    await apiClient.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    resetChatSocket();
    router.push('/login');
  }

  return (
    <UserContext.Provider value={user}>
      <AccountProvider isClient={role === 'client'}>
        <ToastProvider>
          <Shell role={role} name={user.name} userId={user.id} onSignOut={handleSignOut}>
            {children}
          </Shell>
        </ToastProvider>
      </AccountProvider>
    </UserContext.Provider>
  );
}
