'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Segmented, Skeleton, Textarea } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { Composer, MessageList, waHref, type ComposerHandle } from '@/components/chat/thread';
import { useUser } from '@/lib/user-context';
import { useAccount } from '@/lib/account-context';
import { useNav } from '@/lib/nav-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { useChat, type ChatState } from '@/lib/use-chat';
import { desktopPermission, requestDesktopPermission, setSoundEnabled, soundEnabled } from '@/lib/notifier';
import type { Conversation, StaffPayment } from '@/lib/api-types';
import { fmtDate, fmtDateTime, fmtNumber, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const BUSINESS_HOURS = 'Sat–Thu · 9:00–19:00 BST';

const CANNED: { key: string; text: string }[] = [
  { key: 'greeting', text: 'Hi! Thanks for reaching out — I’m looking at your account now.' },
  { key: 'canonical-fix', text: 'Google is treating that page as a duplicate because its canonical points elsewhere. Fix the canonical tag and I’ll resubmit it for free.' },
  { key: 'how-credits-work', text: '1 credit = 1 URL sent to Google. Bing, Yandex, Naver, Seznam and Yep are always free, and credits never expire.' },
  { key: 'bkash-steps', text: 'To pay by bKash: open Credits & billing → Buy credits, choose bKash, complete the payment, and credits are added automatically.' },
  { key: 'gsc-connect', text: 'To enable Google checks, open Sites, click Connect next to Google Search Console, and sign in with an account that owns the property.' },
];

function ConnectionNote({ connected }: { connected: boolean }) {
  return connected ? null : <span className="text-xs text-auth-warn">Reconnecting…</span>;
}

/** Shared "turn this chat into a ticket" action for both sides. */
function useToTicket(conversationId: string | undefined) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!conversationId) return;
    setBusy(true);
    try {
      const t = await apiClient.post<{ id: string; number: string }>(`/chat/conversations/${conversationId}/ticket`, {});
      toast(`Ticket ${t.number} created from this chat`);
      router.push(`/tickets?id=${t.id}`);
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

function AlertsToggle() {
  const toast = useToast();
  const [perm, setPerm] = useState<string>('default');
  const [sound, setSound] = useState(true);
  useEffect(() => {
    setPerm(desktopPermission());
    setSound(soundEnabled());
  }, []);
  return (
    <div className="flex items-center gap-2">
      {perm === 'default' && (
        <Button size="sm" onClick={async () => {
          const p = await requestDesktopPermission();
          setPerm(p);
          toast(p === 'granted' ? 'Desktop alerts on' : 'Desktop alerts blocked by the browser', p === 'granted' ? 'ok' : 'info');
        }}>
          <Icon.bell className="h-3.5 w-3.5" /> Enable desktop alerts
        </Button>
      )}
      <button
        onClick={() => {
          setSoundEnabled(!sound);
          setSound(!sound);
        }}
        aria-pressed={sound}
        className="rounded-md border border-auth-line2 px-2.5 py-1.25 text-[12.5px] text-auth-text2 hover:bg-auth-surface2"
      >
        Sound {sound ? 'on' : 'off'}
      </button>
    </div>
  );
}

function ClientChat({ chat }: { chat: ChatState }) {
  const me = useUser();
  const { credits, profile } = useAccount();
  const { refreshBadges } = useNav();
  const composer = useRef<ComposerHandle>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const conversation = chat.conversations?.[0] ?? null;

  useEffect(() => refreshBadges(), [chat.messages.length, refreshBadges]);

  if (chat.conversations === null) return <Skeleton className="h-[calc(100vh-150px)]" />;
  if (!conversation) {
    return (
      <Card>
        <EmptyState title="No manager assigned yet">You&apos;ll be able to chat here as soon as a manager is assigned to your account.</EmptyState>
      </Card>
    );
  }

  const peer = conversation.peer;
  const firstName = peer.name.split(' ')[0];
  const isOnline = chat.online[peer.id] ?? false;
  const away = peer.availability === 'away';
  const isTyping = chat.typing[conversation.id] ?? false;
  const wa = waHref(peer.whatsapp);

  return (
    <div className="grid gap-4 xl:h-[calc(100vh-150px)] xl:min-h-150 xl:grid-cols-[1fr_300px]">
      <Card className="flex h-[calc(100vh-190px)] min-h-120 flex-col overflow-hidden xl:h-auto">
        <div className="flex items-center gap-3 border-b border-auth-line px-4.5 py-3">
          <Avatar name={peer.name} tone="fox" />
          <div className="min-w-0">
            <b className="block text-[14.5px] font-medium">{peer.name}</b>
            <span className={cn('flex items-center gap-1.5 text-[12.5px]', isOnline && !away ? 'text-auth-ok' : away ? 'text-auth-warn' : 'text-auth-text3')}>
              <i className={cn('h-1.75 w-1.75 rounded-full', isOnline && !away ? 'bg-auth-ok' : away ? 'bg-auth-warn' : 'bg-auth-text3')} />
              {away ? 'Away' : isOnline ? 'Online' : 'Offline'} · your account manager
            </span>
          </div>
          <ConnectionNote connected={chat.connected} />
          <div className="ml-auto flex items-center gap-2">
            {searchOpen ? (
              <Input autoFocus aria-label="Search messages" placeholder="Search messages" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => !search && setSearchOpen(false)} className="w-44 py-1.5 text-[12.5px]" />
            ) : (
              <Button size="sm" onClick={() => setSearchOpen(true)}>Search</Button>
            )}
          </div>
        </div>
        <MessageList
          messages={chat.messages}
          meId={me.id}
          meName={me.name}
          peerName={peer.name}
          peerTone="fox"
          meTone="violet"
          typing={isTyping}
          highlight={search}
          conversationId={conversation.id}
          hasMore={chat.hasMore}
          loadingOlder={chat.loadingOlder}
          onLoadOlder={() => void chat.loadOlder()}
          onQuickReply={(id, answer) => void chat.send(answer, { replyTo: id })}
          onRetry={(m) => void chat.retry(m)}
          onDiscard={chat.discard}
          canAnswerQuickReplies
        />
        <Composer
          ref={composer}
          placeholder={`Message ${firstName}…`}
          onSend={chat.send}
          onTyping={chat.notifyTyping}
          footerLeft="Enter to send · Shift+Enter for a new line · paste or drop files"
          footerRight={isTyping ? `${firstName} is typing…` : !isOnline || away ? `${firstName} will get an email if they’re offline` : undefined}
        />
      </Card>

      <div className="grid content-start gap-4">
        <Card className="p-4.5 text-center">
          <Avatar name={peer.name} tone="fox" size={56} className="mx-auto mb-2.5" />
          <b className="block text-[15px] font-medium">{peer.name}</b>
          <span className="block text-[12.5px] text-auth-text3">Account manager since {fmtDate(peer.since)}</span>
          <div className="mt-3 rounded-md bg-auth-bg2 px-2.5 py-2 text-[12.5px] text-auth-text2">
            {BUSINESS_HOURS}
            <br />
            {away ? 'Away right now — replies when back' : 'Usually replies within the hour'}
          </div>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-md bg-auth-ok-soft py-2.25 text-[13.5px] font-medium text-auth-ok hover:bg-auth-ok/20">
              <Icon.whatsapp /> WhatsApp {firstName}
            </a>
          )}
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <div className="py-1">
            {[
              { icon: 'upload' as const, label: 'Ask about a stuck URL', onClick: () => composer.current?.insert('Hi! This URL has been stuck on Submitted — can you check it? ') },
              { icon: 'card' as const, label: 'Request a credit top-up', onClick: () => composer.current?.insert('Hi! I’d like to top up credits. ') },
            ].map((a) => {
              const IconCmp = Icon[a.icon];
              return (
                <button key={a.label} onClick={a.onClick} className="flex w-full items-center gap-2.5 border-b border-auth-line px-4.5 py-2.5 text-left text-[13.5px] text-auth-text2 hover:bg-white/[0.015] hover:text-auth-text">
                  <IconCmp className="h-3.75 w-3.75 text-auth-text3" />
                  {a.label}
                </button>
              );
            })}
            <Link href="/tickets?new=1" className="flex items-center gap-2.5 px-4.5 py-2.5 text-[13.5px] text-auth-text2 hover:bg-white/[0.015] hover:text-auth-text">
              <Icon.ticket className="h-3.75 w-3.75 text-auth-text3" />
              Open a ticket instead
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title={`${firstName} can see`} />
          <div className="grid gap-2 px-4.5 py-3.5 text-[13px]">
            {[
              ['Credit balance', credits ? fmtNumber(credits.balance) : '—'],
              ['Sites', fmtNumber(profile?.sites.length ?? 0)],
              ['Used this week', fmtNumber(credits?.usedThisWeek ?? 0)],
              ['Client since', profile ? fmtDate(profile.createdAt) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-auth-text2">
                <span>{k}</span>
                <b className="font-mono text-[12.5px] font-medium text-auth-text">{v}</b>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AddCreditModal({ client, onClose }: { client: Conversation['peer'] | null; onClose: (added?: number) => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount('');
    setNote('');
    setError(null);
  }, [client]);

  async function submit() {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) return setError('Enter a whole number of credits.');
    if (!client) return;
    setBusy(true);
    try {
      await apiClient.post(`/admin/users/${client.id}/credits/grant`, { amount: n, note: note.trim() || undefined });
      toast(`Added ${fmtNumber(n)} credits to ${client.name}`);
      onClose(n);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={client !== null}
      onClose={() => onClose()}
      title={`Add credit · ${client?.name ?? ''}`}
      width={440}
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>Add credits</Button>
        </>
      }
    >
      <Field label="Credits">
        <Input autoFocus mono inputMode="numeric" placeholder="1,000" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <Field label="Note (shown in the client's ledger)" className="mb-0">
        <Input placeholder="e.g. bKash BJK7X2R4P1 · ticket TKT-1042" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <p role="alert" className="mt-3 text-[12.5px] text-auth-bad">{error}</p>}
    </Modal>
  );
}

function ClientPanel({ conversation, onNoteSaved }: { conversation: Conversation; onNoteSaved: (note: string) => void }) {
  const toast = useToast();
  const peer = conversation.peer;
  const [note, setNote] = useState(conversation.internalNote ?? '');
  const [saved, setSaved] = useState(conversation.internalNote ?? '');
  const payments = useApi<StaffPayment[]>('/admin/payments');

  useEffect(() => {
    setNote(conversation.internalNote ?? '');
    setSaved(conversation.internalNote ?? '');
  }, [conversation.id, conversation.internalNote]);

  async function saveNote() {
    if (note === saved) return;
    try {
      await apiClient.patch(`/chat/conversations/${conversation.id}/note`, { note });
      setSaved(note);
      onNoteSaved(note);
      toast('Note saved', 'info');
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  const clientPayments = (payments.data ?? []).filter((p) => p.client.id === peer.id).slice(0, 4);

  return (
    <div className="hidden content-start gap-4 2xl:grid">
      <Card>
        <CardHeader title={peer.name} right={<Pill tone={peer.status === 'active' ? 'ok' : 'warn'}>{peer.status === 'active' ? 'Active' : peer.status}</Pill>} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-4.5 py-3.5 text-[12.5px]">
          <dt className="text-auth-text3">Credits</dt>
          <dd className="text-right font-mono">{fmtNumber(peer.credits ?? 0)}</dd>
          <dt className="text-auth-text3">Email</dt>
          <dd className="truncate text-right">{peer.email}</dd>
          <dt className="text-auth-text3">WhatsApp</dt>
          <dd className="text-right font-mono">{peer.whatsapp ?? '—'}</dd>
          <dt className="text-auth-text3">Client since</dt>
          <dd className="text-right font-mono">{fmtDate(peer.since)}</dd>
          {conversation.managerName && (
            <>
              <dt className="text-auth-text3">Manager</dt>
              <dd className="text-right">{conversation.managerName}</dd>
            </>
          )}
        </dl>
        <div className="border-t border-auth-line px-4.5 py-3.5">
          <label htmlFor="internal-note" className="mb-1.5 block text-xs text-auth-warn">Internal note · staff only</label>
          <Textarea
            id="internal-note"
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => void saveNote()}
            placeholder="e.g. Prefers WhatsApp after 19:00"
            className="min-h-16 border-auth-warn/30 bg-auth-warn-soft text-[12.5px]"
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Recent payments" right={<Link href="/admin/payments" className="text-[12.5px] text-auth-accent">All</Link>} />
        {clientPayments.length === 0 ? (
          <p className="px-4.5 py-3.5 text-[12.5px] text-auth-text3">No payments from this client yet.</p>
        ) : (
          clientPayments.map((p) => (
            <div key={p.id} className="flex justify-between gap-2 border-t border-auth-line px-4.5 py-2.5 text-[12.5px] first:border-t-0">
              <span>+{fmtNumber(p.credits)} · {p.methodLabel}</span>
              <span className="font-mono text-auth-text3">{fmtDateTime(p.createdAt)}</span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function AvailabilityToggle() {
  const toast = useToast();
  const state = useApi<{ availability: 'available' | 'away' }>('/chat/availability');
  const value = state.data?.availability ?? 'available';
  return (
    <Segmented
      value={value}
      onChange={async (next) => {
        state.setData({ availability: next });
        try {
          await apiClient.patch('/chat/availability', { availability: next });
          toast(next === 'away' ? 'You’re shown as away — clients are told you’ll reply later' : 'You’re available', 'info');
        } catch (e) {
          toast(errorMessage(e), 'bad');
          void state.reload();
        }
      }}
      options={[
        { value: 'available', label: <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-auth-ok" />Available</span> },
        { value: 'away', label: <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-auth-warn" />Away</span> },
      ]}
    />
  );
}

/** Admins move a client (and their chat history) to another manager without leaving the inbox. */
function TransferSelect({ clientId, currentManagerId, onDone }: { clientId: string; currentManagerId?: string; onDone: () => void }) {
  const toast = useToast();
  const managers = useApi<{ id: string; name: string }[]>('/admin/managers');
  const [busy, setBusy] = useState(false);
  async function transfer(managerId: string) {
    const name = managers.data?.find((m) => m.id === managerId)?.name ?? 'the new manager';
    if (!window.confirm(`Move this client and their conversation to ${name}?`)) return;
    setBusy(true);
    try {
      await apiClient.patch(`/admin/users/${clientId}/assign-manager`, { managerId });
      toast(`Transferred to ${name}`);
      onDone();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }
  return (
    <select
      aria-label="Transfer to manager"
      disabled={busy || !managers.data}
      value=""
      onChange={(e) => e.target.value && void transfer(e.target.value)}
      className="rounded-md border border-auth-line2 bg-auth-surface px-2 py-1.25 text-[12.5px] font-medium text-auth-text hover:bg-auth-surface2"
    >
      <option value="">Transfer…</option>
      {managers.data?.filter((m) => m.id !== currentManagerId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

function StaffInbox({ chat, supervising }: { chat: ChatState; supervising: boolean }) {
  const me = useUser();
  const { refreshBadges } = useNav();
  const stats = useApi<{ avgFirstReplyMinutesToday: number | null; repliedToday: number; awaitingReply: number }>(supervising ? null : '/chat/stats');
  const [filter, setFilter] = useState<'unread' | 'all' | 'online'>('all');
  const [query, setQuery] = useState('');
  const [mobileThread, setMobileThread] = useState(false);
  const [creditFor, setCreditFor] = useState<Conversation['peer'] | null>(null);
  const composerRef = useRef<ComposerHandle>(null);

  useEffect(() => refreshBadges(), [chat.selectedId, refreshBadges]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (chat.conversations ?? []).filter((c) => {
      if (filter === 'unread' && c.unread === 0) return false;
      if (filter === 'online' && !chat.online[c.peer.id]) return false;
      if (q && !c.peer.name.toLowerCase().includes(q) && !(c.lastMessage?.body.toLowerCase().includes(q) ?? false) && !(c.managerName?.toLowerCase().includes(q) ?? false)) return false;
      return true;
    });
  }, [chat.conversations, chat.online, filter, query]);

  const all = chat.conversations ?? [];
  const unreadCount = all.filter((c) => c.unread > 0).length;
  const onlineCount = all.filter((c) => chat.online[c.peer.id]).length;
  const selected = all.find((c) => c.id === chat.selectedId) ?? null;
  const toTicket = useToTicket(selected?.id);

  if (chat.conversations === null) return <Skeleton className="h-[calc(100vh-150px)]" />;

  const summary = [
    `${unreadCount} unread`,
    supervising ? `${all.length} active conversations` : `${onlineCount} client${onlineCount === 1 ? '' : 's'} online`,
    !supervising && stats.data?.avgFirstReplyMinutesToday !== null && stats.data?.avgFirstReplyMinutesToday !== undefined ? `avg first reply today ${stats.data.avgFirstReplyMinutesToday} min` : null,
    !supervising && stats.data?.awaitingReply ? `${stats.data.awaitingReply} awaiting your reply` : null,
  ].filter(Boolean);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12.5px] text-auth-text3">
        <span>{summary.join(' · ')}</span>
        <ConnectionNote connected={chat.connected} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <AlertsToggle />
          {!supervising && <AvailabilityToggle />}
        </div>
      </div>

      {all.length === 0 ? (
        <Card>
          <EmptyState title={supervising ? 'No conversations yet' : 'No clients assigned yet'}>
            {supervising ? 'Conversations appear here once clients start chatting with their managers.' : 'Conversations appear here as soon as clients are assigned to you.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:h-[calc(100vh-190px)] lg:min-h-150 lg:grid-cols-[300px_1fr] 2xl:grid-cols-[280px_1fr_260px]">
          <Card className={cn('flex max-h-[70vh] flex-col overflow-hidden lg:max-h-none', mobileThread && 'hidden lg:flex')}>
            <div className="grid gap-2 border-b border-auth-line p-2.5">
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'unread', label: `Unread · ${unreadCount}` },
                  { value: 'all', label: `All · ${all.length}` },
                  { value: 'online', label: 'Online' },
                ]}
              />
              <Input aria-label="Search clients or messages" placeholder={supervising ? 'Search clients, managers or messages' : 'Search clients or messages'} value={query} onChange={(e) => setQuery(e.target.value)} className="py-1.5 text-[12.5px]" />
            </div>
            <div className="flex-1 overflow-auto">
              {list.length === 0 && <p className="p-4 text-center text-[12.5px] text-auth-text3">Nothing here.</p>}
              {list.map((c) => {
                const on = chat.online[c.peer.id];
                const active = c.id === chat.selectedId;
                const typingNow = chat.typing[c.id];
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      chat.select(c.id);
                      setMobileThread(true);
                    }}
                    className={cn('flex w-full gap-2.5 border-b border-l-2 border-auth-line px-3.5 py-3 text-left', active ? 'border-l-auth-accent bg-auth-accent-soft' : 'border-l-transparent hover:bg-white/[0.015]')}
                  >
                    <span className="relative">
                      <Avatar name={c.peer.name} size={34} />
                      <i className={cn('absolute -right-px -bottom-px h-2.25 w-2.25 rounded-full border-2 border-auth-surface', on ? 'bg-auth-ok' : 'bg-auth-text3')} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2">
                        <b className="truncate text-[13.5px] font-medium">{c.peer.name}</b>
                        <span className="text-[11.5px] whitespace-nowrap text-auth-text3">{c.lastMessage ? relativeTime(c.lastMessage.createdAt) : ''}</span>
                      </span>
                      {supervising && c.managerName && <span className="block truncate text-[11px] text-auth-text3">Manager: {c.managerName}</span>}
                      <span className={cn('mt-0.5 block truncate text-[12.5px]', c.unread ? 'text-auth-text' : 'text-auth-text3')}>
                        {typingNow ? <i className="text-auth-ok">typing…</i> : c.lastMessage ? `${c.lastMessage.senderId === me.id ? 'You: ' : ''}${c.lastMessage.body}` : 'No messages yet'}
                      </span>
                    </span>
                    {c.unread > 0 && (
                      <span className="flex h-4.5 min-w-4.5 items-center justify-center self-center rounded-full bg-auth-fox px-1.25 text-[11px] font-semibold text-[#1a1208]">{c.unread}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {selected ? (
            <Card className={cn('flex h-[calc(100vh-230px)] min-h-120 flex-col overflow-hidden lg:h-auto', !mobileThread && 'hidden lg:flex')}>
              <div className="flex flex-wrap items-center gap-3 border-b border-auth-line px-4.5 py-3">
                <button className="text-auth-text3 lg:hidden" aria-label="Back to conversations" onClick={() => setMobileThread(false)}>←</button>
                <Avatar name={selected.peer.name} />
                <div className="min-w-0">
                  <b className="block text-[14.5px] font-medium">{selected.peer.name}</b>
                  <span className={cn('text-[12.5px]', chat.online[selected.peer.id] ? 'text-auth-ok' : 'text-auth-text3')}>
                    {chat.online[selected.peer.id] ? 'Online' : 'Offline'} · {fmtNumber(selected.peer.credits ?? 0)} credits
                    {supervising && selected.managerName ? ` · manager ${selected.managerName}` : ''}
                  </span>
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setCreditFor(selected.peer)}>Add credit</Button>
                  <Link href={`/admin/users?q=${encodeURIComponent(selected.peer.email ?? selected.peer.name)}`} className="rounded-md border border-auth-line2 px-2.5 py-1.25 text-[12.5px] font-medium hover:bg-auth-surface2">Open profile</Link>
                  <Button size="sm" loading={toTicket.busy} onClick={() => void toTicket.run()}>To ticket</Button>
                  {(me.role === 'admin' || me.role === 'superadmin') && <TransferSelect clientId={selected.peer.id} currentManagerId={selected.managerId} onDone={() => void chat.reloadConversations()} />}
                </div>
              </div>
              {supervising && selected.managerId !== me.id && (
                <div className="bg-auth-warn-soft px-4.5 py-1.5 text-xs text-auth-warn">Supervising — messages you send appear with your name, and reading here doesn’t mark them read for {selected.managerName}.</div>
              )}
              <MessageList
                messages={chat.messages}
                meId={me.id}
                meName={me.name}
                peerName={selected.peer.name}
                peerTone="accent"
                meTone="fox"
                typing={chat.typing[selected.id] ?? false}
                maxWidth="80%"
                conversationId={selected.id}
                hasMore={chat.hasMore}
                loadingOlder={chat.loadingOlder}
                onLoadOlder={() => void chat.loadOlder()}
                onRetry={(m) => void chat.retry(m)}
                onDiscard={chat.discard}
              />
              <div className="flex flex-wrap gap-1.5 px-4.5 pt-2.5">
                {CANNED.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    title={c.text}
                    onClick={() => composerRef.current?.insert(c.text)}
                    className="rounded-full border border-auth-line px-2.5 py-1 font-mono text-xs text-auth-text2 hover:border-auth-line2 hover:text-auth-text"
                  >
                    /{c.key}
                  </button>
                ))}
              </div>
              <Composer
                ref={composerRef}
                placeholder={`Reply to ${selected.peer.name.split(' ')[0]}… type / for saved replies`}
                onSend={chat.send}
                onTyping={chat.notifyTyping}
                cannedReplies={CANNED}
                allowQuickReplies
                footerLeft="Enter to send · ☰ adds reply buttons"
                footerRight={
                  chat.typing[selected.id]
                    ? `${selected.peer.name.split(' ')[0]} is typing…`
                    : chat.online[selected.peer.id]
                      ? undefined
                      : 'Offline — they’ll get an email'
                }
              />
            </Card>
          ) : (
            <Card className="hidden items-center justify-center lg:flex"><EmptyState title="Pick a conversation" /></Card>
          )}

          {selected && <ClientPanel conversation={selected} onNoteSaved={(note) => chat.updateConversation(selected.id, { internalNote: note })} />}
        </div>
      )}

      <AddCreditModal
        client={creditFor}
        onClose={(added) => {
          if (added && creditFor && selected) chat.updateConversation(selected.id, { peer: { ...selected.peer, credits: (selected.peer.credits ?? 0) + added } });
          setCreditFor(null);
        }}
      />
    </>
  );
}

export default function ChatPage() {
  const me = useUser();
  const { profile } = useAccount();
  const isClient = me.role === 'client';
  const canSupervise = me.role === 'admin' || me.role === 'superadmin';
  const [scope, setScope] = useState<'mine' | 'all'>(canSupervise ? 'all' : 'mine');
  const chat = useChat(me.id, { scope });
  const managerFirst = profile?.manager?.name.split(' ')[0];
  const toTicket = useToTicket(isClient ? chat.conversations?.[0]?.id : undefined);

  return (
    <>
      <DashboardTopbar
        title={isClient ? 'Live chat' : 'Chat inbox'}
        subtitle={isClient ? `Talk to your account manager${managerFirst ? ` · ${managerFirst} gets your messages in real time` : ''}` : canSupervise ? 'Every client conversation, live' : 'Your assigned clients, live'}
        search={false}
        action={
          isClient ? (
            <Button loading={toTicket.busy} disabled={!chat.conversations?.[0]} onClick={() => void toTicket.run()}>Turn into ticket</Button>
          ) : canSupervise ? (
            <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'All chats' }, { value: 'mine', label: 'My chats' }]} />
          ) : undefined
        }
      />
      {isClient ? <ClientChat chat={chat} /> : <StaffInbox key={scope} chat={chat} supervising={canSupervise && scope === 'all'} />}
    </>
  );
}
