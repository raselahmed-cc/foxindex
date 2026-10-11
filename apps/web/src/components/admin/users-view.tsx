'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Avatar, Button, Card, Drawer, EmptyState, ErrorBanner, Field, Input, Pill, Segmented, Select, Skeleton, Table, type Tone } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { AddClientModal } from './add-client-modal';
import { CredentialsModal, type IssuedCredentials } from './credentials-modal';
import { useUser } from '@/lib/user-context';
import { useNav } from '@/lib/nav-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import type { AdminUserRow } from '@/lib/api-types';
import { fmtDate, fmtNumber } from '@/lib/format';

type Status = AdminUserRow['status'];

const STATUS: Record<Status, { tone: Tone; label: string }> = {
  pending_email: { tone: 'muted', label: 'Unverified email' },
  pending_approval: { tone: 'warn', label: 'Pending approval' },
  active: { tone: 'ok', label: 'Active' },
  suspended: { tone: 'bad', label: 'Suspended' },
};

function UserDrawer({
  user,
  isAdmin,
  managers,
  onClose,
  onChanged,
}: {
  user: AdminUserRow | null;
  isAdmin: boolean;
  managers: { id: string; name: string }[];
  onClose: () => void;
  onChanged: (patch: Partial<AdminUserRow>) => void;
}) {
  const toast = useToast();
  const { refreshBadges } = useNav();
  const [startingCredit, setStartingCredit] = useState('100');
  const [grant, setGrant] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [managerId, setManagerId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setStartingCredit('100');
    setGrant('');
    setGrantNote('');
    setManagerId(user?.assignedManagerId ?? '');
  }, [user]);

  if (!user) return null;

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    try {
      await action();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  }

  const approve = () =>
    run('approve', async () => {
      const credit = Number(startingCredit || 0);
      await apiClient.post(`/admin/users/${user.id}/approve`, { startingCredit: credit });
      onChanged({ status: 'active', creditBalanceCached: user.creditBalanceCached + credit });
      refreshBadges();
      toast(`${user.name} approved${credit ? ` with ${fmtNumber(credit)} credits` : ''}`);
    });

  const addCredit = () =>
    run('grant', async () => {
      const amount = Number(grant);
      if (!Number.isInteger(amount) || amount <= 0) throw new Error('Enter a whole number of credits');
      const res = await apiClient.post<{ balance: number }>(`/admin/users/${user.id}/credits/grant`, { amount, note: grantNote.trim() || undefined });
      onChanged({ creditBalanceCached: res.balance });
      setGrant('');
      setGrantNote('');
      toast(`Added ${fmtNumber(amount)} credits`);
    });

  const assign = () =>
    run('assign', async () => {
      await apiClient.patch(`/admin/users/${user.id}/assign-manager`, { managerId });
      const m = managers.find((x) => x.id === managerId) ?? null;
      onChanged({ assignedManagerId: managerId, assignedManager: m });
      toast(`Assigned to ${m?.name ?? 'manager'}`);
    });

  const setStatus = (status: 'active' | 'suspended') =>
    run('status', async () => {
      await apiClient.patch(`/admin/users/${user.id}/status`, { status });
      onChanged({ status });
      toast(status === 'suspended' ? `${user.name} suspended and signed out` : `${user.name} reactivated`);
    });

  return (
    <Drawer open onClose={onClose} title={user.name} subtitle={user.email}>
      <div className="mb-4.5 flex items-center gap-3">
        <Avatar name={user.name} size={44} />
        <div>
          <Pill tone={STATUS[user.status].tone}>{STATUS[user.status].label}</Pill>
          <div className="mt-1 text-[12.5px] text-auth-text3">Joined {fmtDate(user.createdAt)}</div>
        </div>
      </div>
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-auth-line bg-auth-bg2 p-3.5 text-[13px]">
        <dt className="text-auth-text3">Credits</dt>
        <dd className="text-right font-mono">{fmtNumber(user.creditBalanceCached)}</dd>
        <dt className="text-auth-text3">WhatsApp</dt>
        <dd className="text-right font-mono">{user.whatsapp ?? user.phone ?? '—'}</dd>
        <dt className="text-auth-text3">Location</dt>
        <dd className="text-right">{[user.city, user.country].filter(Boolean).join(', ') || '—'}</dd>
        <dt className="text-auth-text3">Manager</dt>
        <dd className="text-right">{user.assignedManager?.name ?? 'Unassigned'}</dd>
      </dl>

      {user.status === 'pending_approval' && (
        <section className="mb-5 rounded-lg border border-auth-warn/35 bg-auth-warn-soft p-3.5">
          <b className="mb-1 block text-sm font-medium text-auth-warn">Approve account</b>
          <p className="mb-3 text-[12.5px] text-auth-text2">Email is verified. Approving lets them sign in and submit URLs.</p>
          <Field label="Starting credit" className="mb-3">
            <Input mono inputMode="numeric" value={startingCredit} onChange={(e) => setStartingCredit(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Button variant="primary" loading={busy === 'approve'} onClick={() => void approve()}>Approve {user.name.split(' ')[0]}</Button>
        </section>
      )}

      {user.role === 'client' && user.status === 'active' && (
        <section className="mb-5">
          <h4 className="mb-2 text-sm font-medium">Add credit</h4>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <Input mono inputMode="numeric" aria-label="Credits to add" placeholder="1,000" value={grant} onChange={(e) => setGrant(e.target.value.replace(/\D/g, ''))} />
            <Input aria-label="Note" placeholder="Note, e.g. bKash BJK7X2R4P1" maxLength={500} value={grantNote} onChange={(e) => setGrantNote(e.target.value)} />
          </div>
          <Button className="mt-2" loading={busy === 'grant'} disabled={!grant} onClick={() => void addCredit()}>Add credits</Button>
        </section>
      )}

      {isAdmin && user.role === 'client' && (
        <section className="mb-5">
          <h4 className="mb-2 text-sm font-medium">Account manager</h4>
          <div className="flex gap-2">
            <Select aria-label="Manager" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="" disabled>Choose a manager…</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            <Button loading={busy === 'assign'} disabled={!managerId || managerId === user.assignedManagerId} onClick={() => void assign()}>Assign</Button>
          </div>
        </section>
      )}

      {isAdmin && user.role === 'client' && (user.status === 'active' || user.status === 'suspended') && (
        <section className="border-t border-auth-line pt-4">
          {user.status === 'active' ? (
            <>
              <p className="mb-2 text-[12.5px] text-auth-text3">Suspending signs them out everywhere and blocks API keys. Credits are kept.</p>
              <Button variant="danger" loading={busy === 'status'} onClick={() => void setStatus('suspended')}>Suspend account</Button>
            </>
          ) : (
            <Button loading={busy === 'status'} onClick={() => void setStatus('active')}>Reactivate account</Button>
          )}
        </section>
      )}
    </Drawer>
  );
}

export function UsersView({ mode }: { mode: 'all' | 'approvals' }) {
  const me = useUser();
  const params = useSearchParams();
  const isAdmin = me.role === 'admin' || me.role === 'superadmin';
  const [status, setStatus] = useState<Status | 'all'>(mode === 'approvals' ? 'pending_approval' : ((params.get('status') as Status | null) ?? 'all'));
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(query);
  const [role, setRole] = useState<'client' | 'all'>('client');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (status !== 'all') p.set('status', status);
    if (debounced) p.set('q', debounced);
    if (isAdmin && role === 'client') p.set('role', 'client');
    const s = p.toString();
    return `/admin/users${s ? `?${s}` : ''}`;
  }, [status, debounced, role, isAdmin]);

  const users = useApi<AdminUserRow[]>(path);
  const managers = useApi<{ id: string; name: string }[]>(isAdmin ? '/admin/managers' : null);
  const rows = users.data ?? [];
  const open = rows.find((u) => u.id === openId) ?? null;
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  const title = mode === 'approvals' ? 'Approvals' : me.role === 'manager' ? 'My clients' : 'All users';
  const subtitle =
    mode === 'approvals'
      ? 'Verified accounts waiting for a manager to approve them'
      : me.role === 'manager'
        ? 'Clients assigned to you'
        : 'Every account on the platform';

  return (
    <>
      <DashboardTopbar title={title} subtitle={subtitle} search={false} action={isAdmin && mode !== 'approvals' ? <Button variant="primary" onClick={() => setAdding(true)}>Add user</Button> : undefined} />
      <AddClientModal
        open={adding}
        managers={managers.data ?? []}
        onClose={() => setAdding(false)}
        onCreated={(c) => {
          setAdding(false);
          setIssued(c);
          void users.reload();
        }}
      />
      <CredentialsModal creds={issued} onClose={() => setIssued(null)} />
      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-auth-line px-4.5 py-3">
          {mode === 'all' && (
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending_approval', label: 'Pending' },
                { value: 'active', label: 'Active' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'pending_email', label: 'Unverified' },
              ]}
            />
          )}
          {isAdmin && mode === 'all' && (
            <Segmented value={role} onChange={setRole} options={[{ value: 'client', label: 'Clients' }, { value: 'all', label: 'Everyone' }]} />
          )}
          <Input aria-label="Search by name or email" placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} className="ml-auto max-w-72 py-1.75 text-[13px]" />
        </div>

        {users.error ? (
          <div className="p-4"><ErrorBanner message="Could not load users." onRetry={() => void users.reload()} /></div>
        ) : users.loading && !users.data ? (
          <div className="grid gap-2 p-4.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title={mode === 'approvals' ? 'Nothing waiting for approval' : 'No users match'}>
            {mode === 'approvals' ? 'New sign-ups appear here once they verify their email.' : 'Try a different filter or search.'}
          </EmptyState>
        ) : (
          <Table head={['User', 'Status', ...(isAdmin ? ['Manager'] : []), 'Credits', 'Location', 'Joined', '']}>
            {rows.map((u) => (
              <tr key={u.id} className="cursor-pointer" onClick={() => setOpenId(u.id)}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name} size={28} tone={u.role === 'manager' ? 'fox' : 'accent'} />
                    <div className="min-w-0">
                      <div className="truncate">
                        {u.name}
                        {u.role !== 'client' && <Pill tone="info" dot={false} className="ml-1.5 py-0 text-[11px] capitalize">{u.role}</Pill>}
                      </div>
                      <div className="truncate text-xs text-auth-text3">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td><Pill tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Pill></td>
                {isAdmin && <td className="whitespace-nowrap text-auth-text2">{u.assignedManager?.name ?? <span className="text-auth-warn">Unassigned</span>}</td>}
                <td className="font-mono">{fmtNumber(u.creditBalanceCached)}</td>
                <td className="whitespace-nowrap text-auth-text3">{[u.city, u.country].filter(Boolean).join(', ') || '—'}</td>
                <td className="whitespace-nowrap text-auth-text3">{fmtDate(u.createdAt)}</td>
                <td className="text-right">
                  {u.status === 'pending_approval' ? <Button size="sm" variant="primary">Review</Button> : <Button size="sm">Manage</Button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {rows.length > 0 && <div className="border-t border-auth-line px-4.5 py-3 text-[12.5px] text-auth-text3">{fmtNumber(rows.length)} user{rows.length === 1 ? '' : 's'}{rows.length >= 500 ? ' (showing first 500 — refine your search)' : ''}</div>}
      </Card>

      <UserDrawer
        user={open}
        isAdmin={isAdmin}
        managers={managers.data ?? []}
        onClose={() => setOpenId(null)}
        onChanged={(patch) => {
          users.setData((prev) => (prev ?? []).map((u) => (u.id === openId ? { ...u, ...patch } : u)));
          if (mode === 'approvals' && patch.status === 'active') setOpenId(null);
        }}
      />
    </>
  );
}
