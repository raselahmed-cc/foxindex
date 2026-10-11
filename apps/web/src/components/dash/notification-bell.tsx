'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/dash/icons';
import { useRealtime, type AppNotification } from '@/lib/realtime-context';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const TYPE_ICON: Record<string, keyof typeof Icon> = {
  'ticket.created': 'ticket',
  'ticket.reply': 'ticket',
  'ticket.status': 'ticket',
  'ticket.assigned': 'ticket',
  'ticket.reminder': 'ticket',
  'ticket.csat': 'star',
  'ticket.sla_warning': 'clock',
  'ticket.sla_breach': 'clock',
  'credits.added': 'card',
  'chat.message': 'chat',
};

export function NotificationBell() {
  const router = useRouter();
  const { notifications, unreadNotifications, markNotificationsRead } = useRealtime();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openItem(n: AppNotification) {
    if (!n.readAt) void markNotificationsRead([n.id]);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={unreadNotifications ? `Notifications, ${unreadNotifications} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8.5 w-8.5 items-center justify-center rounded-md border border-auth-line2 hover:bg-auth-surface2"
      >
        <Icon.bell className="h-3.75 w-3.75" />
        {unreadNotifications > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-auth-fox px-1 text-[10px] font-semibold text-[#1a1208]">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute top-10 right-0 z-70 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-auth-line2 bg-auth-surface shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]">
          <div className="flex items-center justify-between border-b border-auth-line px-4 py-2.5">
            <b className="text-sm font-semibold">Notifications</b>
            {unreadNotifications > 0 && (
              <button className="text-[12.5px] text-auth-accent hover:underline" onClick={() => void markNotificationsRead()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-auth-text3">You’re all caught up.</p>
            ) : (
              notifications.map((n) => {
                const IconCmp = Icon[TYPE_ICON[n.type] ?? 'bell'];
                return (
                  <button key={n.id} onClick={() => openItem(n)} className={cn('flex w-full gap-3 border-b border-auth-line px-4 py-3 text-left last:border-b-0 hover:bg-white/[0.02]', !n.readAt && 'bg-auth-accent-soft/40')}>
                    <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-auth-surface2 text-auth-text2">
                      <IconCmp className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <b className={cn('text-[13px] font-medium', !n.readAt ? 'text-auth-text' : 'text-auth-text2')}>{n.title}</b>
                        {!n.readAt && <i className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-auth-fox" aria-label="unread" />}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-auth-text3">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-auth-text3">{relativeTime(n.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
