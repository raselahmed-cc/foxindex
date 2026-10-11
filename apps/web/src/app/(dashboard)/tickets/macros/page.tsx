'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Modal, Pill, Select, Skeleton, Switch, Textarea } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { MacroActionsLine } from '@/components/tickets/dialogs';
import { TagEditor } from '@/components/tickets/parts';
import { useUser } from '@/lib/user-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { fmtNumber, relativeTime } from '@/lib/format';
import { MACRO_PLACEHOLDERS, PRIORITY, STATUS, type Macro, type MacroActions, type TicketPriority, type TicketStatus } from '@/lib/tickets';

interface Draft {
  id?: string;
  title: string;
  body: string;
  shared: boolean;
  actions: MacroActions;
}

const EMPTY: Draft = { title: '', body: '', shared: false, actions: {} };

function MacroEditor({ draft, onClose, onSaved, isAdmin }: { draft: Draft | null; onClose: () => void; onSaved: () => void; isAdmin: boolean }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(draft ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insert(token: string) {
    const el = bodyRef.current;
    const at = el?.selectionStart ?? d.body.length;
    setD({ ...d, body: d.body.slice(0, at) + token + d.body.slice(el?.selectionEnd ?? at) });
    requestAnimationFrame(() => el?.focus());
  }

  async function save() {
    setError(null);
    if (d.title.trim().length < 2) return setError('Give the macro a short name.');
    if (!d.body.trim()) return setError('Write the reply text.');
    setBusy(true);
    const payload = { title: d.title.trim(), body: d.body.trim(), shared: d.shared, actions: { ...d.actions, addTags: d.actions.addTags?.length ? d.actions.addTags : undefined } };
    try {
      if (d.id) await apiClient.patch(`/support/macros/${d.id}`, payload);
      else await apiClient.post('/support/macros', payload);
      toast(d.id ? 'Macro saved' : 'Macro created');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={draft !== null}
      onClose={onClose}
      title={d.id ? 'Edit macro' : 'New macro'}
      width={600}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{d.id ? 'Save macro' : 'Create macro'}</Button></>}
    >
      <Field label="Name"><Input autoFocus maxLength={80} placeholder="e.g. Ask for affected URLs" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
      <Field label="Reply text" hint={<span>Insert: {MACRO_PLACEHOLDERS.map((p) => <button key={p} type="button" className="mr-1.5 font-mono text-auth-accent" onClick={() => insert(p)}>{p}</button>)}</span>}>
        <Textarea ref={bodyRef} className="min-h-36" maxLength={5000} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} placeholder={'Hi {{client.firstName}},\n\nCould you send the URLs that are still not indexed?'} />
      </Field>
      <fieldset className="mb-3.5 rounded-md border border-auth-line p-3">
        <legend className="px-1 text-xs text-auth-text3">When this reply is sent, also…</legend>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Set status">
            <Select value={d.actions.status ?? ''} onChange={(e) => setD({ ...d, actions: { ...d.actions, status: (e.target.value || undefined) as TicketStatus | undefined } })}>
              <option value="">Default (waiting on client)</option>
              {(Object.keys(STATUS) as TicketStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </Select>
          </Field>
          <Field label="Set priority">
            <Select value={d.actions.priority ?? ''} onChange={(e) => setD({ ...d, actions: { ...d.actions, priority: (e.target.value || undefined) as TicketPriority | undefined } })}>
              <option value="">Leave as is</option>
              {(['urgent', 'high', 'normal', 'low'] as TicketPriority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Add tags" className="mb-0">
          <div className="rounded-md border border-auth-line bg-auth-bg px-2.5 py-1.75"><TagEditor tags={d.actions.addTags ?? []} onChange={(addTags) => setD({ ...d, actions: { ...d.actions, addTags } })} /></div>
        </Field>
      </fieldset>
      {isAdmin && <Switch checked={d.shared} onChange={(shared) => setD({ ...d, shared })} showLabel label="Share with the whole support team" />}
      {error && <p role="alert" className="mt-3 text-[12.5px] text-auth-bad">{error}</p>}
    </Modal>
  );
}

export default function MacrosPage() {
  const me = useUser();
  const toast = useToast();
  const isAdmin = me.role === 'admin' || me.role === 'superadmin';
  const macros = useApi<Macro[]>(me.role === 'client' ? null : '/support/macros');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [q, setQ] = useState('');

  if (me.role === 'client') return <EmptyState title="Not available">Macros are for the FoxIndex support team.</EmptyState>;

  async function remove(m: Macro) {
    if (!window.confirm(`Delete “${m.title}”? Agents using it will no longer see it.`)) return;
    try {
      await apiClient.delete(`/support/macros/${m.id}`);
      toast('Macro deleted', 'info');
      void macros.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  const term = q.trim().toLowerCase();
  const shown = (macros.data ?? []).filter((m) => !term || m.title.toLowerCase().includes(term) || m.body.toLowerCase().includes(term));

  return (
    <>
      <DashboardTopbar
        crumb={<Link href="/tickets" className="hover:text-auth-text2">Tickets</Link>}
        title="Macros"
        subtitle="Saved replies that can also set status, priority and tags in one click"
        search={false}
        action={<Button variant="primary" onClick={() => setEditing({ ...EMPTY, shared: isAdmin })}>New macro</Button>}
      />
      <Card>
        <div className="border-b border-auth-line p-3">
          <Input aria-label="Search macros" placeholder="Search macros" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm py-1.5 text-[12.5px]" />
        </div>
        {macros.error ? (
          <div className="p-4"><ErrorBanner message="Could not load macros." onRetry={() => void macros.reload()} /></div>
        ) : !macros.data ? (
          <div className="grid gap-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState title={term ? 'No macros match' : 'No macros yet'} action={!term ? <Button variant="primary" onClick={() => setEditing({ ...EMPTY, shared: isAdmin })}>Create the first one</Button> : undefined}>
            Macros turn your most common answers into one click from the reply box.
          </EmptyState>
        ) : (
          <ul>
            {shown.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 border-b border-auth-line px-4.5 py-3.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[14px] font-medium">{m.title}</b>
                    <Pill tone={m.shared ? 'info' : 'muted'} dot={false}>{m.shared ? 'Team' : 'Personal'}</Pill>
                    <span className="text-xs text-auth-text3">Used {fmtNumber(m.usageCount)} times · updated {relativeTime(m.updatedAt)}{m.createdByName ? ` · by ${m.createdByName}` : ''}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] whitespace-pre-wrap text-auth-text2">{m.body}</p>
                  <MacroActionsLine actions={m.actions} />
                </div>
                {m.canEdit && (
                  <div className="flex flex-shrink-0 gap-2">
                    <Button size="sm" onClick={() => setEditing({ id: m.id, title: m.title, body: m.body, shared: m.shared, actions: m.actions })}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(m)}>Delete</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <MacroEditor key={editing.id ?? 'new'} draft={editing} isAdmin={isAdmin} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void macros.reload(); }} />}
    </>
  );
}
