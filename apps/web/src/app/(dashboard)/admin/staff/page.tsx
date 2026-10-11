'use client';

import { useState } from 'react';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Avatar, Button, Card, CardHeader, ErrorBanner, Field, Input, Modal, Pill, Segmented, Select, Skeleton, Table, type Tone } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { CredentialsModal, type IssuedCredentials } from '@/components/admin/credentials-modal';
import { useUser } from '@/lib/user-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import type { StaffMember } from '@/lib/api-types';
import { fmtNumber, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type StaffRole = StaffMember['role'];

const ROLE: Record<StaffRole, { tone: Tone; label: string }> = {
  superadmin: { tone: 'bad', label: 'Superadmin' },
  admin: { tone: 'info', label: 'Admin' },
  manager: { tone: 'ok', label: 'Manager' },
};

const MATRIX: [string, boolean, boolean, boolean][] = [
  ['Approve assigned clients', true, true, true],
  ['Add credit · own clients', true, true, true],
  ['Approve manual payments · own clients', true, true, true],
  ['Approve payments over ৳10,000', false, true, true],
  ['Add credit · any user', false, true, true],
  ['Assign managers', false, true, true],
  ['Suspend users', false, true, true],
  ['Transfer chats & tickets between managers', false, true, true],
  ['Add, edit & deactivate managers', false, true, true],
  ['Providers, gateways, packs', false, false, true],
  ['Add & manage admins and superadmins', false, false, true],
];

function InviteCard({ onInvited, canCreateAdmins }: { onInvited: () => void; canCreateAdmins: boolean }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'manager' as StaffRole, maxClients: '45', password: '' });
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setError(null);
    if (form.name.trim().length < 2) return setError('Enter their full name.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('Enter a valid email.');
    if (form.password && form.password.length < 10) return setError('Use at least 10 characters, or leave the password empty to generate one.');
    setBusy(true);
    try {
      const r = await apiClient.post<{ email: string; password: string; emailSent: boolean }>('/admin/staff', {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        maxClients: form.role === 'manager' && form.maxClients ? Number(form.maxClients) : null,
        password: form.password || undefined,
      });
      setIssued({ name: form.name.trim(), email: r.email, password: r.password, emailSent: r.emailSent, role: form.role });
      setForm({ name: '', email: '', role: 'manager', maxClients: '45', password: '' });
      onInvited();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Add staff" />
      <div className="p-4.5">
        <Field label="Full name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={120} /></Field>
        <Field label="Email"><Input type="email" placeholder="name@foxindex.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
        <Field label="Role">
          <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as StaffRole }))}>
            <option value="manager">Manager</option>
            {canCreateAdmins && <option value="admin">Admin</option>}
            {canCreateAdmins && <option value="superadmin">Superadmin</option>}
          </Select>
        </Field>
        {form.role === 'manager' && (
          <Field label="Max clients" hint="Auto-assign skips managers at this number. Empty = no limit.">
            <Input mono inputMode="numeric" value={form.maxClients} onChange={(e) => setForm((f) => ({ ...f, maxClients: e.target.value.replace(/\D/g, '') }))} />
          </Field>
        )}
        <Field label="Password (optional)" hint="Leave empty to generate a strong one. You’ll see it once after creating the account.">
          <Input type="text" autoComplete="new-password" mono value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </Field>
        {error && <p role="alert" className="mb-2 text-[12.5px] text-auth-bad">{error}</p>}
        <Button variant="primary" className="w-full" loading={busy} onClick={() => void invite()}>Create staff account</Button>
        <p className="mt-2.5 text-xs text-auth-text3">The account works right away. We also email the login once email is set up.</p>
        <CredentialsModal creds={issued} onClose={() => setIssued(null)} />
      </div>
    </Card>
  );
}

function EditModal({ member, onClose, onSaved, canChangeRoles }: { member: StaffMember | null; onClose: () => void; onSaved: () => void; canChangeRoles: boolean }) {
  const toast = useToast();
  const [role, setRole] = useState<StaffRole>('manager');
  const [maxClients, setMaxClients] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if ((member?.id ?? null) !== lastId) {
    setLastId(member?.id ?? null);
    setRole(member?.role ?? 'manager');
    setMaxClients(member?.maxClients ? String(member.maxClients) : '');
  }

  async function save(patch: Record<string, unknown>, message: string) {
    if (!member) return;
    setBusy(true);
    try {
      await apiClient.patch(`/admin/staff/${member.id}`, patch);
      toast(message);
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title={`Edit ${member?.name ?? ''}`}
      width={460}
      footer={
        <>
          {member?.status === 'active' ? (
            <Button variant="danger" className="mr-auto" disabled={busy} onClick={() => void save({ status: 'suspended' }, `${member.name} deactivated and signed out`)}>Deactivate</Button>
          ) : (
            <Button className="mr-auto" disabled={busy} onClick={() => member && void save({ status: 'active' }, `${member.name} reactivated`)}>Reactivate</Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => void save({ role, maxClients: role === 'manager' && maxClients ? Number(maxClients) : null }, 'Staff member updated')}
          >
            Save
          </Button>
        </>
      }
    >
      {canChangeRoles && (
        <Field label="Role" hint="Changing a role signs them out so the new permissions apply immediately.">
          <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </Select>
        </Field>
      )}
      {role === 'manager' && (
        <Field label="Max clients" className="mb-0" hint="Deactivating a manager hands their clients, open chats and open tickets to the least busy active manager.">
          <Input mono inputMode="numeric" placeholder="No limit" value={maxClients} onChange={(e) => setMaxClients(e.target.value.replace(/\D/g, ''))} />
        </Field>
      )}
    </Modal>
  );
}

export default function StaffPage() {
  const me = useUser();
  const isSuper = me.role === 'superadmin';
  const canManage = isSuper || me.role === 'admin';
  // Admins manage managers; only a superadmin edits admins and superadmins (also enforced by the API).
  const canEdit = (s: StaffMember) => isSuper || (canManage && s.role === 'manager');
  const staff = useApi<StaffMember[]>('/admin/staff');
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all');
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const rows = (staff.data ?? []).filter((s) => roleFilter === 'all' || s.role === roleFilter);
  const counts = (r: StaffRole) => (staff.data ?? []).filter((s) => s.role === r).length;

  return (
    <>
      <DashboardTopbar
        title={isSuper ? 'Staff & roles' : 'Managers & staff'}
        subtitle={staff.data ? `${staff.data.length} staff · ${counts('admin') + counts('superadmin')} admins · ${counts('manager')} managers` : undefined}
        search={false}
      />
      <div className={cn('grid grid-cols-1 items-start gap-4', canManage && 'xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]')}>
        <Card>
          <CardHeader
            title="Staff"
            right={
              <Segmented
                value={roleFilter}
                onChange={setRoleFilter}
                options={[{ value: 'all', label: 'All' }, { value: 'manager', label: 'Managers' }, { value: 'admin', label: 'Admins' }, { value: 'superadmin', label: 'Super' }]}
              />
            }
          />
          {staff.error ? <div className="p-4"><ErrorBanner message="Could not load staff." onRetry={() => void staff.reload()} /></div> : staff.loading && !staff.data ? <Skeleton className="m-4 h-40" /> : (
            <Table head={['Person', 'Role', 'Clients', 'Last sign-in', 'Status', '']}>
              {rows.map((s) => (
                <tr key={s.id} className={cn(s.status !== 'active' && 'opacity-55')}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} size={28} tone={s.role === 'manager' ? 'fox' : 'accent'} />
                      <div className="min-w-0">
                        <div className="truncate">{s.name}</div>
                        <div className="truncate text-xs text-auth-text3">{s.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><Pill tone={ROLE[s.role].tone}>{ROLE[s.role].label}</Pill></td>
                  <td className="font-mono whitespace-nowrap">{s.role === 'manager' ? `${fmtNumber(s.clients)}${s.maxClients ? ` / ${fmtNumber(s.maxClients)}` : ''}` : <span className="text-auth-text3">all</span>}</td>
                  <td className="whitespace-nowrap text-auth-text3">{s.lastActiveAt ? relativeTime(s.lastActiveAt) : 'Never'}</td>
                  <td><Pill tone={s.status === 'active' ? 'ok' : 'bad'}>{s.status === 'active' ? 'Active' : 'Deactivated'}</Pill></td>
                  <td className="text-right">
                    {s.id === me.id ? <span className="text-xs text-auth-text3">you</span> : canEdit(s) ? <Button variant="link" onClick={() => setEditing(s)}>Edit</Button> : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {canManage && (
          <div className="grid gap-4">
            <InviteCard canCreateAdmins={isSuper} onInvited={() => void staff.reload()} />
            <Card>
              <CardHeader title="Permission matrix" right={<Pill tone="muted" dot={false}>Enforced by the API</Pill>} />
              <Table head={['Action', 'Mgr', 'Admin', 'Super']}>
                {MATRIX.map(([action, ...cols]) => (
                  <tr key={action}>
                    <td className="whitespace-normal">{action}</td>
                    {cols.map((ok, i) => (
                      <td key={i} className={cn('text-center', ok ? 'text-auth-ok' : 'text-auth-text3')}>{ok ? '✓' : '—'}</td>
                    ))}
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        )}
      </div>
      <EditModal member={editing} canChangeRoles={isSuper} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void staff.reload(); }} />
    </>
  );
}
