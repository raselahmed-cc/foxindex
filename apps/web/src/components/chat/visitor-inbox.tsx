'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Card, EmptyState, ErrorBanner, Pill, Segmented, Skeleton, Textarea } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { useUser } from '@/lib/user-context';
import { useRealtime } from '@/lib/realtime-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { fmtDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface VisitorChatItem {
  id: string;
  name: string;
  email: string;
  status: 'open' | 'closed';
  assignee: { id: string; name: string } | null;
  lastMessageAt: string;
  createdAt: string;
  unread: boolean;
  preview: { body: string; fromVisitor: boolean } | null;
}

interface VisitorThread {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'open' | 'closed';
  page: string | null;
  createdAt: string;
  assignee: { id: string; name: string } | null;
  messages: { id: string; senderType: 'visitor' | 'staff' | 'system'; senderName: string; body: string; createdAt: string }[];
}

/** Count of unanswered website chats for the tab label; refreshes on realtime pings. */
export function useVisitorUnread(enabled: boolean): number {
  const { socket } = useRealtime();
  const list = useApi<{ unread: number }>(enabled ? '/support/visitor-chats?status=open' : null);
  const { reload } = list;
  useEffect(() => {
    if (!socket || !enabled) return;
    const onUpdate = () => void reload();
    socket.on('visitor:updated', onUpdate);
    return () => {
      socket.off('visitor:updated', onUpdate);
    };
  }, [socket, reload, enabled]);
  return list.data?.unread ?? 0;
}

function Thread({ id, onChanged }: { id: string; onChanged: () => void }) {
  const me = useUser();
  const toast = useToast();
  const { socket } = useRealtime();
  const thread = useApi<VisitorThread>(`/support/visitor-chats/${id}`);
  const { reload } = thread;
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = (p: { id: string }) => p.id === id && void reload();
    socket.on('visitor:updated', onUpdate);
    return () => {
      socket.off('visitor:updated', onUpdate);
    };
  }, [socket, id, reload]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.data?.messages.length]);

  const t = thread.data;

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await apiClient.post(`/support/visitor-chats/${id}/messages`, { body });
      setDraft('');
      await reload();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function patch(update: Record<string, unknown>, message: string) {
    try {
      await apiClient.patch(`/support/visitor-chats/${id}`, update);
      toast(message, 'info');
      await reload();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  if (thread.error) return <Card className="p-4"><ErrorBanner message="Could not load this chat." onRetry={() => void reload()} /></Card>;
  if (!t) return <Card className="p-4"><Skeleton className="h-60" /></Card>;
  const wa = t.phone?.replace(/[^\d]/g, '');

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden lg:h-[calc(100vh-230px)] lg:min-h-120">
      <div className="flex flex-wrap items-center gap-3 border-b border-auth-line px-4.5 py-3">
        <Avatar name={t.name} />
        <div className="min-w-0">
          <b className="block text-[14.5px] font-medium">{t.name}</b>
          <span className="text-[12.5px] text-auth-text3">
            <a href={`mailto:${t.email}`} className="hover:text-auth-text2">{t.email}</a>
            {t.phone && <> · {t.phone}</>} · started {relativeTime(t.createdAt)}{t.page ? ` on ${t.page}` : ''}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Pill tone={t.status === 'open' ? 'ok' : 'muted'}>{t.status === 'open' ? 'Open' : 'Closed'}</Pill>
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-auth-line2 px-2.5 py-1.25 text-[12.5px] font-medium hover:bg-auth-surface2">
              <Icon.whatsapp className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          {t.assignee?.id !== me.id && <Button size="sm" onClick={() => void patch({ assignedTo: me.id }, 'Chat assigned to you')}>Assign to me</Button>}
          {t.status === 'open' ? (
            <Button size="sm" onClick={() => void patch({ status: 'closed' }, 'Chat closed')}>Close</Button>
          ) : (
            <Button size="sm" onClick={() => void patch({ status: 'open' }, 'Chat reopened')}>Reopen</Button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-auto px-4.5 py-4">
        {t.messages.map((m) =>
          m.senderType === 'system' ? (
            <p key={m.id} className="text-center text-xs text-auth-text3">{m.body} · {fmtDateTime(m.createdAt)}</p>
          ) : (
            <div key={m.id} className={cn('max-w-[78%]', m.senderType === 'staff' && 'ml-auto text-right')}>
              <div className={cn('inline-block rounded-[10px] px-3.5 py-2.5 text-left text-[13.5px] whitespace-pre-wrap break-words', m.senderType === 'staff' ? 'bg-auth-accent-soft' : 'bg-auth-surface2')}>{m.body}</div>
              <div className="mt-1 text-xs text-auth-text3">{m.senderType === 'staff' ? m.senderName : t.name} · {fmtDateTime(m.createdAt)}</div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-auth-line px-4.5 py-3">
        <Textarea
          aria-label="Reply to visitor"
          className="min-h-18 bg-auth-bg"
          placeholder={`Reply to ${t.name.split(' ')[0]}… Enter to send, Shift+Enter for a new line`}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-auth-text3">
          <span>{t.assignee ? `Assigned to ${t.assignee.name}` : 'Unassigned — replying assigns it to you'} · the visitor sees your first name</span>
          <Button size="sm" variant="primary" loading={busy} disabled={!draft.trim()} onClick={() => void send()}>Send</Button>
        </div>
      </div>
    </Card>
  );
}

/** Staff view of chats started from the public website (no account). */
export function VisitorInbox({ initialId }: { initialId?: string | null }) {
  const { socket } = useRealtime();
  const [status, setStatus] = useState<'open' | 'closed' | 'all'>('open');
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const list = useApi<{ unread: number; items: VisitorChatItem[] }>(`/support/visitor-chats?status=${status}`);
  const { reload } = list;
  const items = list.data?.items ?? [];

  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => void reload();
    socket.on('visitor:updated', onUpdate);
    return () => {
      socket.off('visitor:updated', onUpdate);
    };
  }, [socket, reload]);

  useEffect(() => {
    if (!selected && items[0] && typeof window !== 'undefined' && window.innerWidth >= 1024) setSelected(items[0].id);
  }, [items, selected]);

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className={cn('flex min-h-0 flex-col overflow-hidden lg:h-[calc(100vh-230px)] lg:min-h-120', selected && 'hidden lg:flex')}>
        <div className="border-b border-auth-line p-3">
          <Segmented value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />
        </div>
        <div className="flex-1 overflow-auto">
          {list.error ? (
            <div className="p-3"><ErrorBanner message="Could not load website chats." onRetry={() => void reload()} /></div>
          ) : !list.data ? (
            <div className="grid gap-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : items.length === 0 ? (
            <EmptyState title={status === 'open' ? 'No open website chats' : 'Nothing here'}>Visitors can start a chat from the home page without an account.</EmptyState>
          ) : (
            items.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={cn('block w-full border-b border-l-2 border-auth-line px-3.5 py-3 text-left', c.id === selected ? 'border-l-auth-accent bg-auth-accent-soft' : 'border-l-transparent hover:bg-white/[0.015]')}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {c.unread && <i className="h-1.75 w-1.75 flex-shrink-0 rounded-full bg-auth-fox" aria-label="unread" />}
                    <b className="truncate text-[13.5px] font-medium">{c.name}</b>
                  </span>
                  <span className="text-xs whitespace-nowrap text-auth-text3">{relativeTime(c.lastMessageAt)}</span>
                </span>
                <span className="block truncate text-[12px] text-auth-text3">{c.email}{c.assignee ? ` · ${c.assignee.name}` : ' · unassigned'}</span>
                {c.preview && <span className="mt-0.5 block truncate text-[12.5px] text-auth-text2">{c.preview.fromVisitor ? '' : 'You: '}{c.preview.body}</span>}
              </button>
            ))
          )}
        </div>
      </Card>
      {selected ? (
        <div>
          <button className="mb-2 text-[12.5px] text-auth-text3 lg:hidden" onClick={() => setSelected(null)}>← All website chats</button>
          <Thread key={selected} id={selected} onChanged={() => void reload()} />
        </div>
      ) : (
        <Card className="hidden items-center justify-center lg:flex"><EmptyState title="Pick a website chat" /></Card>
      )}
    </div>
  );
}
