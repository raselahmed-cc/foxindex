'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, EmptyState, ErrorBanner, Input, Pill, Segmented, Select, Skeleton } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { NewTicketModal } from '@/components/tickets/dialogs';
import { SlaBadge, TagChips } from '@/components/tickets/parts';
import { TicketThread } from '@/components/tickets/ticket-thread';
import { useUser } from '@/lib/user-context';
import { useAccount } from '@/lib/account-context';
import { useNav } from '@/lib/nav-context';
import { useRealtime } from '@/lib/realtime-context';
import { apiClient, downloadFile } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { relativeTime } from '@/lib/format';
import { CATEGORIES, PRIORITY, STAFF_VIEWS, STATUS, cap, type TicketList, type TicketPriority, type TicketSort, type TicketStatus, type TicketView } from '@/lib/tickets';
import { cn } from '@/lib/utils';

const PAGE = 50;

/** Staff multi-select actions. Each ticket still gets its own event line + audit entry server-side. */
function BulkBar({ ids, isAdmin, onDone, onClear }: { ids: string[]; isAdmin: boolean; onDone: () => void; onClear: () => void }) {
  const toast = useToast();
  const managers = useApi<{ id: string; name: string }[]>(isAdmin ? '/admin/managers' : null);
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);

  async function apply(change: Record<string, unknown>, label: string) {
    setBusy(true);
    try {
      const r = await apiClient.post<{ updated: number; failed: { id: string; message: string }[] }>('/tickets/bulk', { ids, ...change });
      toast(r.failed.length ? `${label}: ${r.updated} updated, ${r.failed.length} skipped (${r.failed[0].message})` : `${label} · ${r.updated} ticket${r.updated === 1 ? '' : 's'}`, r.failed.length ? 'bad' : 'info');
      onDone();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="region" aria-label="Bulk actions" className="grid gap-2 border-b border-auth-line bg-auth-accent-soft/40 p-3">
      <div className="flex items-center justify-between text-[12.5px]">
        <b className="font-medium">{ids.length} selected</b>
        <button className="text-auth-accent" onClick={onClear}>Clear</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Select aria-label="Set status" disabled={busy} value="" onChange={(e) => e.target.value && void apply({ status: e.target.value }, `Status → ${STATUS[e.target.value as TicketStatus].label}`)} className="w-auto py-1 text-[12px]">
          <option value="">Status…</option>
          {(Object.keys(STATUS) as TicketStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </Select>
        <Select aria-label="Set priority" disabled={busy} value="" onChange={(e) => e.target.value && void apply({ priority: e.target.value }, `Priority → ${e.target.value}`)} className="w-auto py-1 text-[12px]">
          <option value="">Priority…</option>
          {(['urgent', 'high', 'normal', 'low'] as TicketPriority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
        </Select>
        {isAdmin && (
          <Select aria-label="Assign to" disabled={busy} value="" onChange={(e) => e.target.value && void apply({ assignedManagerId: e.target.value === 'none' ? null : e.target.value }, 'Reassigned')} className="w-auto py-1 text-[12px]">
            <option value="">Assign…</option>
            <option value="none">Unassign</option>
            {managers.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        )}
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const v = tag.trim().toLowerCase();
            if (v) void apply({ addTags: [v] }, `Tagged ${v}`).then(() => setTag(''));
          }}
        >
          <Input aria-label="Add tag to selected" placeholder="Add tag" value={tag} maxLength={32} onChange={(e) => setTag(e.target.value)} className="w-24 py-1 text-[12px]" />
        </form>
      </div>
    </div>
  );
}

function TicketsInner() {
  const me = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { profile } = useAccount();
  const { refreshBadges } = useNav();
  const { ticketsVersion } = useRealtime();
  const staff = me.role !== 'client';
  const isAdmin = me.role === 'admin' || me.role === 'superadmin';
  const [view, setView] = useState<TicketView>(staff ? (me.role === 'manager' ? 'mine' : 'open') : 'open');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<TicketSort>(staff ? 'due' : 'activity');
  const [limit, setLimit] = useState(PAGE);
  const [checked, setChecked] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(params.get('id'));
  const [creating, setCreating] = useState(params.get('new') === '1');
  const tags = useApi<{ tag: string; count: number }[]>(staff ? '/tickets/tags' : null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Deep links (notifications, related tickets) change ?id= while mounted.
  const paramId = params.get('id');
  useEffect(() => {
    if (paramId) setSelected(paramId);
  }, [paramId]);

  const filterQs = useMemo(() => {
    const qs = new URLSearchParams({ view, sort });
    if (debounced) qs.set('q', debounced);
    if (priority) qs.set('priority', priority);
    if (category) qs.set('category', category);
    if (tag) qs.set('tag', tag);
    return qs;
  }, [view, sort, debounced, priority, category, tag]);

  useEffect(() => {
    setLimit(PAGE);
    setChecked([]);
  }, [filterQs]);

  const list = useApi<TicketList>(`/tickets?${filterQs.toString()}&limit=${limit}`);
  const { reload } = list;

  useEffect(() => {
    void reload();
  }, [ticketsVersion, reload]);

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  useEffect(() => {
    if (!selected && items[0] && typeof window !== 'undefined' && window.innerWidth >= 1024) setSelected(items[0].id);
  }, [items, selected]);

  const select = useCallback(
    (id: string) => {
      setSelected(id);
      router.replace(`/tickets?id=${id}`, { scroll: false });
      list.setData((prev) => (prev ? { ...prev, items: prev.items.map((t) => (t.id === id ? { ...t, unread: false } : t)) } : prev ?? { counts: {}, hasMore: false, items: [] }));
      setTimeout(refreshBadges, 500);
    },
    [router, list, refreshBadges],
  );

  async function exportCsv() {
    try {
      await downloadFile(`/tickets/export?${filterQs.toString()}`, `tickets-${view}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  const counts = list.data?.counts ?? {};
  const managerFirst = profile?.manager?.name.split(' ')[0];
  const filtersActive = Boolean(priority || category || tag || debounced);
  const allChecked = items.length > 0 && items.every((t) => checked.includes(t.id));

  return (
    <>
      <DashboardTopbar
        title={staff ? (me.role === 'manager' ? 'Tickets' : 'All tickets') : 'Tickets'}
        subtitle={
          staff
            ? `${counts.open ?? 0} open · ${counts.breached ?? 0} breached · ${counts.at_risk ?? 0} at risk`
            : `${counts.open ?? 0} open${managerFirst ? ` · ${managerFirst} usually replies within about an hour on weekdays` : ''}`
        }
        search={false}
        action={
          staff ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/tickets/reports" className="inline-flex items-center gap-1.5 rounded-md border border-auth-line2 px-3 py-1.75 text-[13px] hover:bg-auth-surface2"><Icon.chart className="h-3.5 w-3.5" /> Reports</Link>
              <Button onClick={() => void exportCsv()}><Icon.download className="h-3.5 w-3.5" /> Export CSV</Button>
              <Button variant="primary" onClick={() => setCreating(true)}>New ticket</Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => setCreating(true)}>New ticket</Button>
          )
        }
      />

      <div className="grid gap-4 lg:h-[calc(100vh-150px)] lg:min-h-150 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className={cn('flex min-h-0 flex-col overflow-hidden', selected && 'hidden lg:flex')}>
          <div className="grid gap-2 border-b border-auth-line p-3">
            {staff ? (
              <Select aria-label="View" value={view} onChange={(e) => setView(e.target.value as TicketView)} className="py-1.75 text-[13px] font-medium">
                {STAFF_VIEWS.filter((v) => isAdmin || v.value !== 'unassigned').map((v) => (
                  <option key={v.value} value={v.value}>{v.label}{counts[v.value] !== undefined ? ` (${counts[v.value]})` : ''}</option>
                ))}
              </Select>
            ) : (
              <Segmented
                value={view === 'resolved' || view === 'all' ? view : 'open'}
                onChange={(v) => setView(v)}
                options={[
                  { value: 'open', label: `Open · ${counts.open ?? 0}` },
                  { value: 'resolved', label: `Resolved · ${counts.resolved ?? 0}` },
                  { value: 'all', label: 'All' },
                ]}
              />
            )}
            <Input aria-label="Search tickets" placeholder={staff ? 'Search subject, TKT number, client' : 'Search by subject or TKT number'} value={query} onChange={(e) => setQuery(e.target.value)} className="py-1.5 text-[12.5px]" />
            {staff && (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
                <Select aria-label="Priority filter" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority | '')} className="py-1 text-[12px]">
                  <option value="">Any priority</option>
                  {(['urgent', 'high', 'normal', 'low'] as TicketPriority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
                </Select>
                <Select aria-label="Category filter" value={category} onChange={(e) => setCategory(e.target.value)} className="py-1 text-[12px]">
                  <option value="">Any category</option>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
                <Select aria-label="Tag filter" value={tag} onChange={(e) => setTag(e.target.value)} className="py-1 text-[12px]">
                  <option value="">Any tag</option>
                  {tags.data?.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}
                </Select>
                <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as TicketSort)} className="py-1 text-[12px]">
                  <option value="due">Sort: SLA due</option>
                  <option value="activity">Sort: latest activity</option>
                  <option value="priority">Sort: priority</option>
                  <option value="created">Sort: newest</option>
                </Select>
              </div>
            )}
            {staff && (
              <div className="flex items-center justify-between text-[12px] text-auth-text3">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={allChecked} onChange={(e) => setChecked(e.target.checked ? items.map((t) => t.id) : [])} className="accent-[var(--color-auth-accent)]" />
                  Select all shown
                </label>
                {filtersActive && (
                  <button className="text-auth-accent" onClick={() => { setPriority(''); setCategory(''); setTag(''); setQuery(''); }}>Clear filters</button>
                )}
              </div>
            )}
          </div>
          {staff && checked.length > 0 && <BulkBar ids={checked} isAdmin={isAdmin} onClear={() => setChecked([])} onDone={() => { setChecked([]); void reload(); }} />}
          <div className="flex-1 overflow-auto">
            {list.error ? (
              <div className="p-3"><ErrorBanner message="Could not load tickets." onRetry={() => void reload()} /></div>
            ) : list.loading && !list.data ? (
              <div className="grid gap-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : items.length === 0 ? (
              <EmptyState
                title={filtersActive ? 'Nothing matches these filters' : view === 'breached' ? 'No SLA breaches' : view === 'at_risk' ? 'Nothing at risk' : view === 'open' || view === 'mine' ? 'No open tickets' : 'No tickets here'}
                action={!staff ? <Button variant="primary" onClick={() => setCreating(true)}>Open a ticket</Button> : undefined}
              >
                {staff ? (view === 'breached' || view === 'at_risk' ? 'Every ticket is inside its service level.' : 'Tickets from your clients appear here.') : 'For quick questions, the live chat is faster.'}
              </EmptyState>
            ) : (
              <>
                {items.map((t) => {
                  const s = STATUS[t.status];
                  const done = t.status === 'resolved' || t.status === 'closed';
                  return (
                    <div key={t.id} className={cn('flex border-b border-l-2 border-auth-line', t.id === selected ? 'border-l-auth-accent bg-auth-accent-soft' : 'border-l-transparent hover:bg-white/[0.015]', done && t.id !== selected && 'opacity-60')}>
                      {staff && (
                        <label className="flex items-start pt-3.5 pl-3">
                          <span className="sr-only">Select {t.number}</span>
                          <input type="checkbox" checked={checked.includes(t.id)} onChange={(e) => setChecked((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)))} className="accent-[var(--color-auth-accent)]" />
                        </label>
                      )}
                      <button onClick={() => select(t.id)} className="block min-w-0 flex-1 px-3.5 py-3.25 text-left">
                        <span className="mb-1 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {t.unread && <i className="h-1.75 w-1.75 flex-shrink-0 rounded-full bg-auth-fox" aria-label="unread" />}
                            <b className="min-w-0 truncate text-[13.5px] font-medium">{t.subject}</b>
                          </span>
                          <Pill tone={s.tone}>{!staff && s.clientLabel ? s.clientLabel : s.label}</Pill>
                        </span>
                        <span className="flex items-center gap-1.5 text-[12.5px] text-auth-text3">
                          <span className="font-mono text-xs">{t.number}</span>
                          {staff && t.client ? <span className="truncate">· {t.client.name}</span> : <span>· {cap(t.category)}</span>}
                          {(t.priority === 'high' || t.priority === 'urgent') && <span className={PRIORITY[t.priority].className}>· {PRIORITY[t.priority].label}</span>}
                          <span className="ml-auto whitespace-nowrap">{relativeTime(t.lastMessageAt)}</span>
                        </span>
                        {staff && (t.sla || t.tags.length > 0 || t.assignee !== undefined) && (
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <SlaBadge sla={t.sla} />
                            <TagChips tags={t.tags} max={2} />
                            {isAdmin && <span className="ml-auto text-[11.5px] text-auth-text3">{t.assignee ? t.assignee.name : 'Unassigned'}</span>}
                          </span>
                        )}
                        {t.preview && <span className="mt-1.25 block truncate text-[12.5px] text-auth-text2">{t.preview.senderName}: {t.preview.body}</span>}
                      </button>
                    </div>
                  );
                })}
                {list.data?.hasMore && (
                  <div className="p-3 text-center">
                    <Button size="sm" loading={list.loading} onClick={() => setLimit((l) => Math.min(200, l + PAGE))} disabled={limit >= 200}>
                      {limit >= 200 ? 'Refine filters to see more' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        {selected ? (
          <TicketThread
            key={selected}
            ticketId={selected}
            onOpen={select}
            onBack={() => {
              setSelected(null);
              router.replace('/tickets', { scroll: false });
            }}
            onChanged={() => {
              void reload();
              refreshBadges();
            }}
          />
        ) : (
          <Card className="hidden items-center justify-center lg:flex">
            <EmptyState title="Pick a ticket">{!staff && 'Or open a new one — your manager is notified right away.'}</EmptyState>
          </Card>
        )}
      </div>

      <NewTicketModal
        open={creating}
        staff={staff}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setView(staff ? 'all' : 'open');
          void reload();
          select(id);
        }}
      />
    </>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-auth-text3">Loading…</div>}>
      <TicketsInner />
    </Suspense>
  );
}
