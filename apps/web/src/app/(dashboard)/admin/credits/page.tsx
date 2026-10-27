'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, CardHeader, EmptyState, ErrorBanner, Field, Input, Pill, Select, Skeleton, Stat, Switch, Table, type Tone } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { CreditAdjustForm, type CreditLimits } from '@/components/admin/credit-adjust';
import { useUser } from '@/lib/user-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import type { AdminUserRow, LedgerType } from '@/lib/api-types';
import { fmtDateTime, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CreditSettings {
  creditsPerUrl: number;
  managerMaxPerAdjustment: number;
  managerDailyLimit: number;
  managersCanDeduct: boolean;
  adminMaxPerAdjustment: number;
}

interface Overview {
  outstanding: number;
  issuedThisMonth: number;
  purchasedThisMonth: number;
  usedThisMonth: number;
  usedToday: number;
  refundedThisMonth: number;
  deductedThisMonth: number;
  lowBalance: { id: string; name: string; email: string; balance: number }[];
  settings: CreditSettings;
  limits: CreditLimits;
}

interface Entry {
  id: string;
  amount: number;
  type: LedgerType;
  note: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  performedBy: string | null;
}

const TYPE: Record<LedgerType, { label: string; tone: Tone }> = {
  payment_credit: { label: 'Purchase', tone: 'ok' },
  manual_add: { label: 'Added by staff', tone: 'info' },
  manual_deduct: { label: 'Removed by staff', tone: 'bad' },
  signup_bonus: { label: 'Welcome credits', tone: 'info' },
  submission_deduct: { label: 'URL submission', tone: 'muted' },
  refund: { label: 'Refund', tone: 'warn' },
};

const PAGE = 50;

function toCsv(rows: Entry[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [['Date', 'Client', 'Email', 'Type', 'Credits', 'Reason', 'By'].join(',')];
  for (const r of rows) {
    lines.push([r.createdAt, esc(r.user.name), r.user.email, r.type, r.amount, esc(r.note ?? ''), esc(r.performedBy ?? '')].join(','));
  }
  return lines.join('\n');
}

function Ledger({ userFilter, onClearUser, version }: { userFilter: { id: string; name: string } | null; onClearUser: () => void; version: number }) {
  const [type, setType] = useState<LedgerType | ''>('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ limit: String(PAGE) });
        if (type) p.set('type', type);
        if (debounced) p.set('q', debounced);
        if (userFilter) p.set('userId', userFilter.id);
        if (before) p.set('before', before);
        const page = await apiClient.get<Entry[]>(`/admin/credits/ledger?${p}`);
        setRows((prev) => (before ? [...prev, ...page] : page));
        setDone(page.length < PAGE);
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [type, debounced, userFilter],
  );

  useEffect(() => {
    void load();
  }, [load, version]);

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader title="Credit ledger" subtitle="Every credit in and out, newest first — append-only" right={rows.length > 0 && <Button size="sm" onClick={exportCsv}>Export CSV</Button>} />
      <div className="flex flex-wrap items-center gap-2 border-b border-auth-line px-4.5 py-3">
        <Input aria-label="Search the ledger" placeholder="Search client, email or reason" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full py-1.5 text-[13px] sm:w-64" />
        <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value as LedgerType | '')} className="w-auto py-1.5 text-[12.5px]">
          <option value="">All types</option>
          {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        {userFilter && (
          <button onClick={onClearUser} className="rounded-full bg-auth-accent-soft px-2.5 py-1 text-[12.5px] text-auth-accent">
            {rows.find((r) => r.user.id === userFilter.id)?.user.name ?? userFilter.name} ✕
          </button>
        )}
      </div>
      {error && <div className="p-4"><ErrorBanner message="Could not load the ledger." onRetry={() => void load()} /></div>}
      {!error && rows.length === 0 && !loading ? (
        <EmptyState title="No ledger entries">Credit purchases, staff adjustments, submissions and refunds show up here.</EmptyState>
      ) : (
        <Table head={['When', 'Client', 'Type', 'Credits', 'Reason', 'By']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-xs whitespace-nowrap text-auth-text3">{fmtDateTime(r.createdAt)}</td>
              <td className="max-w-[200px]">
                <b className="block truncate font-medium">{r.user.name}</b>
                <span className="block truncate text-xs text-auth-text3">{r.user.email}</span>
              </td>
              <td className="whitespace-nowrap"><Pill tone={TYPE[r.type]?.tone ?? 'muted'}>{TYPE[r.type]?.label ?? r.type}</Pill></td>
              <td className={cn('text-right font-mono whitespace-nowrap', r.amount > 0 ? 'text-auth-ok' : 'text-auth-text')}>{r.amount > 0 ? '+' : ''}{fmtNumber(r.amount)}</td>
              <td className="max-w-[280px] truncate text-[12.5px] text-auth-text2" title={r.note ?? undefined}>{r.note ?? '—'}</td>
              <td className="text-[12.5px] whitespace-nowrap text-auth-text3">{r.performedBy ?? (r.type === 'submission_deduct' ? 'Client' : 'Automatic')}</td>
            </tr>
          ))}
          {loading && rows.length === 0 && [0, 1, 2, 3].map((i) => <tr key={i}><td colSpan={6}><Skeleton className="h-5" /></td></tr>)}
        </Table>
      )}
      <div className="flex items-center justify-between border-t border-auth-line px-4.5 py-3 text-[12.5px] text-auth-text3">
        <span>{fmtNumber(rows.length)} entries loaded</span>
        {!done && rows.length > 0 && <Button variant="link" disabled={loading} onClick={() => void load(rows[rows.length - 1].createdAt)}>Load older</Button>}
      </div>
    </Card>
  );
}

function AdjustCard({ isAdmin, onDone }: { isAdmin: boolean; onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<AdminUserRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const search = useApi<AdminUserRow[]>(debounced.length >= 2 ? `/admin/users?q=${encodeURIComponent(debounced)}&status=active${isAdmin ? '&role=client' : ''}` : null);

  return (
    <Card>
      <CardHeader title="Adjust credits" subtitle="Add or remove credits for one client" />
      <div className="p-4.5">
        {picked ? (
          <>
            <div className="mb-3.5 flex items-center justify-between gap-2 rounded-lg border border-auth-line bg-auth-bg2 px-3.5 py-2.5">
              <div className="min-w-0">
                <b className="block truncate text-[13.5px] font-medium">{picked.name}</b>
                <span className="block truncate text-xs text-auth-text3">{picked.email} · balance <span className="font-mono text-auth-text">{fmtNumber(picked.creditBalanceCached)}</span></span>
              </div>
              <Button size="sm" onClick={() => setPicked(null)}>Change</Button>
            </div>
            <CreditAdjustForm
              key={picked.id}
              userId={picked.id}
              userName={picked.name}
              balance={picked.creditBalanceCached}
              onDone={(balance) => {
                setPicked({ ...picked, creditBalanceCached: balance });
                onDone();
              }}
            />
          </>
        ) : (
          <Field label="Client" hint="Type at least two letters of a name or email">
            <Input placeholder="Search active clients" value={query} onChange={(e) => setQuery(e.target.value)} />
            {debounced.length >= 2 && (
              <div className="mt-1.5 max-h-60 overflow-auto rounded-md border border-auth-line">
                {search.loading && !search.data ? (
                  <div className="p-2.5"><Skeleton className="h-8" /></div>
                ) : (search.data ?? []).filter((u) => u.role === 'client').length === 0 ? (
                  <p className="p-3 text-[12.5px] text-auth-text3">No active clients match.</p>
                ) : (
                  (search.data ?? [])
                    .filter((u) => u.role === 'client')
                    .slice(0, 8)
                    .map((u) => (
                      <button key={u.id} onClick={() => setPicked(u)} className="flex w-full items-center justify-between gap-2 border-b border-auth-line px-3 py-2 text-left text-[13px] last:border-b-0 hover:bg-auth-surface2">
                        <span className="min-w-0">
                          <b className="block truncate font-medium">{u.name}</b>
                          <span className="block truncate text-xs text-auth-text3">{u.email}</span>
                        </span>
                        <span className="font-mono text-xs text-auth-text2">{fmtNumber(u.creditBalanceCached)}</span>
                      </button>
                    ))
                )}
              </div>
            )}
          </Field>
        )}
      </div>
    </Card>
  );
}

function PolicyCard({ settings, editable, onSaved }: { settings: CreditSettings; editable: boolean; onSaved: (s: CreditSettings) => void }) {
  const toast = useToast();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(settings), [settings]);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  const num = (key: Exclude<keyof CreditSettings, 'managersCanDeduct'>, label: string, hint: string) => (
    <Field label={label} hint={hint} className="mb-3">
      <Input
        mono
        inputMode="numeric"
        disabled={!editable}
        value={String(form[key])}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value.replace(/\D/g, '').slice(0, 8) || 0) })}
      />
    </Field>
  );

  async function save() {
    setSaving(true);
    try {
      const saved = await apiClient.put<CreditSettings>('/admin/credits/settings', form);
      onSaved(saved);
      toast('Credit policy saved');
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Credit policy" subtitle={editable ? 'Applies to every client and staff member' : 'Set by the superadmin'} right={!editable && <Pill tone="muted">Read only</Pill>} />
      <div className="p-4.5">
        {num('creditsPerUrl', 'Credits per URL', 'Charged for every accepted URL, all search engines included')}
        {num('adminMaxPerAdjustment', 'Admin limit per adjustment', 'Largest single add or remove by an admin')}
        {num('managerMaxPerAdjustment', 'Account manager limit per adjustment', 'Largest single add or remove by a manager')}
        {num('managerDailyLimit', 'Account manager daily limit', 'Total a manager can add or remove per day')}
        <div className="flex items-center justify-between gap-3 border-t border-auth-line pt-3 text-[13.5px]">
          <div>
            Managers can remove credits
            <small className="block text-[12.5px] text-auth-text3">Off: only admins can take credits away</small>
          </div>
          <Switch label="Managers can remove credits" checked={form.managersCanDeduct} disabled={!editable} onChange={(v) => setForm({ ...form, managersCanDeduct: v })} />
        </div>
        {editable && (
          <Button variant="primary" className="mt-4" loading={saving} disabled={!dirty} onClick={() => void save()}>Save policy</Button>
        )}
      </div>
    </Card>
  );
}

function CreditsPageInner() {
  const me = useUser();
  const params = useSearchParams();
  const isAdmin = me.role === 'admin' || me.role === 'superadmin';
  const overview = useApi<Overview>('/admin/credits/overview');
  const [version, setVersion] = useState(0);
  // "View ledger" from a client's drawer links here with ?user=<id>; the chip picks up the name from the rows.
  const [userFilter, setUserFilter] = useState<{ id: string; name: string } | null>(() => {
    const id = params.get('user');
    return id ? { id, name: 'Selected client' } : null;
  });

  const o = overview.data;
  const refresh = () => {
    setVersion((v) => v + 1);
    void overview.reload();
  };

  return (
    <>
      <DashboardTopbar
        title="Credit management"
        subtitle={me.role === 'manager' ? 'Credits for your clients — within the limits your admin sets' : 'Balances, adjustments and the full credit ledger for every client'}
        search={false}
      />

      {overview.error && <ErrorBanner message="Could not load credit totals." onRetry={() => void overview.reload()} />}
      <div className="mb-4 grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {o ? (
          <>
            <Stat label="Credits held by clients" value={fmtNumber(o.outstanding)} detail={`${o.lowBalance.length} active client${o.lowBalance.length === 1 ? '' : 's'} under 50`} detailTone={o.lowBalance.length ? 'warn' : undefined} />
            <Stat label="Used this month" value={fmtNumber(o.usedThisMonth)} detail={`${fmtNumber(o.usedToday)} today`} />
            <Stat label="Issued this month" value={fmtNumber(o.issuedThisMonth)} detail={`${fmtNumber(o.purchasedThisMonth)} purchased`} />
            <Stat label="Refunded / removed" value={`${fmtNumber(o.refundedThisMonth)} / ${fmtNumber(o.deductedThisMonth)}`} detail="This month" />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Ledger userFilter={userFilter} onClearUser={() => setUserFilter(null)} version={version} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AdjustCard isAdmin={isAdmin} onDone={refresh} />
          {o && o.lowBalance.length > 0 && (
            <Card>
              <CardHeader title="Running low" subtitle="Active clients with fewer than 50 credits" />
              <div className="text-[13px]">
                {o.lowBalance.map((u) => (
                  <button key={u.id} onClick={() => setUserFilter({ id: u.id, name: u.name })} className="flex w-full items-center justify-between gap-2 border-b border-auth-line px-4.5 py-2.5 text-left last:border-b-0 hover:bg-white/[0.015]">
                    <span className="min-w-0">
                      <b className="block truncate font-medium">{u.name}</b>
                      <span className="block truncate text-xs text-auth-text3">{u.email}</span>
                    </span>
                    <span className={cn('font-mono', u.balance <= 0 ? 'text-auth-bad' : 'text-auth-warn')}>{fmtNumber(u.balance)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {o && <PolicyCard settings={o.settings} editable={me.role === 'superadmin'} onSaved={() => void overview.reload()} />}
        </div>
      </div>
    </>
  );
}

export default function CreditsPage() {
  return (
    <Suspense>
      <CreditsPageInner />
    </Suspense>
  );
}
