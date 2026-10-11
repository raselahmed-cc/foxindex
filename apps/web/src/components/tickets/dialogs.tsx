'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Input, Modal, Pill, Select, Skeleton, Textarea } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { useAccount } from '@/lib/account-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { ACCEPTED_FILES } from '@/lib/upload';
import type { AdminUserRow } from '@/lib/api-types';
import { fmtNumber, relativeTime } from '@/lib/format';
import { CATEGORIES, PRIORITY, STATUS, cap, type Macro, type TicketCategory, type TicketDetail, type TicketList, type TicketPriority } from '@/lib/tickets';
import { cn } from '@/lib/utils';
import { FileChips, TagEditor, useUploads } from './parts';

/** Clients open their own tickets; staff open one on a client's behalf (outreach). */
export function NewTicketModal({ open, onClose, onCreated, staff }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; staff: boolean }) {
  const { profile } = useAccount();
  const toast = useToast();
  const uploads = useUploads();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<TicketCategory>('indexing');
  const [subject, setSubject] = useState('');
  const [siteId, setSiteId] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [clientQuery, setClientQuery] = useState('');
  const [client, setClient] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(clientQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [clientQuery]);
  const clients = useApi<AdminUserRow[]>(staff && open && !client && debounced.length >= 2 ? `/admin/users?role=client&status=active&q=${encodeURIComponent(debounced)}` : null);

  function reset() {
    setSubject('');
    setBody('');
    setSiteId('');
    setPriority('normal');
    setTags([]);
    setClient(null);
    setClientQuery('');
    uploads.clear();
  }

  async function submit() {
    setError(null);
    if (staff && !client) return setError('Choose the client this ticket is for.');
    if (subject.trim().length < 3) return setError('Add a short subject (at least 3 characters).');
    if (!body.trim()) return setError(staff ? 'Write the message the client will see.' : 'Describe what happened.');
    setBusy(true);
    try {
      const t = await apiClient.post<{ id: string; number: string }>('/tickets', {
        subject: subject.trim(),
        category,
        priority,
        siteId: staff ? null : siteId || null,
        body: body.trim(),
        attachmentIds: uploads.ids,
        ...(staff ? { clientId: client!.id, tags } : {}),
      });
      toast(staff ? `Ticket ${t.number} opened — ${client!.name} has been notified` : `Ticket ${t.number} opened — your manager has been notified`);
      reset();
      onCreated(t.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={staff ? 'New ticket for a client' : 'New ticket'}
      width={580}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={uploads.uploading} onClick={() => void submit()}>
            {staff ? 'Open ticket and notify client' : 'Open ticket'}
          </Button>
        </>
      }
    >
      {staff && (
        <Field label="Client">
          {client ? (
            <div className="flex items-center justify-between rounded-md border border-auth-line bg-auth-bg px-3 py-2 text-[13px]">
              <span>
                <b className="font-medium">{client.name}</b> <span className="text-auth-text3">· {client.email}</span>
              </span>
              <button className="text-[12.5px] text-auth-accent" onClick={() => setClient(null)}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <Input autoFocus placeholder="Search by name or email" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} />
              {debounced.length >= 2 && (
                <div className="absolute top-full right-0 left-0 z-10 mt-1 max-h-56 overflow-auto rounded-md border border-auth-line2 bg-auth-surface shadow-lg" role="listbox" aria-label="Matching clients">
                  {clients.loading && !clients.data ? (
                    <div className="p-2"><Skeleton className="h-8" /></div>
                  ) : clients.data?.length ? (
                    clients.data.map((c) => (
                      <button key={c.id} role="option" aria-selected={false} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-auth-surface2" onClick={() => setClient(c)}>
                        <b className="font-medium">{c.name}</b> <span className="text-auth-text3">· {c.email}</span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2.5 text-[12.5px] text-auth-text3">No active clients match.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </Field>
      )}

      <div role="radiogroup" aria-label="Category" className="mb-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CATEGORIES.map((c) => {
          const IconCmp = Icon[c.icon];
          return (
            <button
              key={c.value}
              role="radio"
              aria-checked={category === c.value}
              onClick={() => setCategory(c.value)}
              className={cn('rounded-md border px-2 py-2.5 text-center text-[12.5px]', category === c.value ? 'border-auth-accent bg-auth-accent-soft text-auth-text' : 'border-auth-line text-auth-text2 hover:border-auth-line2')}
            >
              <IconCmp className={cn('mx-auto mb-1.25 h-4 w-4', category === c.value ? 'text-auth-accent' : 'text-auth-text3')} />
              {c.label}
            </button>
          );
        })}
      </div>
      <Field label="Subject">
        <Input autoFocus={!staff} maxLength={160} placeholder={staff ? 'e.g. 12 URLs in your sitemap return 404' : 'Short summary, e.g. 6 URLs still not indexed after 3 days'} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        {!staff && (
          <Field label="Site (optional)">
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Not about a site</option>
              {profile?.sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
            <option value="high">{staff ? 'High' : 'High — blocking my work'}</option>
            {staff && <option value="urgent">Urgent</option>}
          </Select>
        </Field>
        {staff && (
          <Field label="Tags (optional)">
            <div className="rounded-md border border-auth-line bg-auth-bg px-2.5 py-1.75"><TagEditor tags={tags} onChange={setTags} /></div>
          </Field>
        )}
      </div>
      <Field label={staff ? 'Message to the client' : 'Details'} hint={staff ? 'The client sees this as the first message. The ticket starts as waiting on them.' : 'Paste URLs, transaction IDs, and what you expected to happen.'}>
        <Textarea className="min-h-28" maxLength={10_000} placeholder={staff ? 'What you noticed and what the client should do next.' : 'What happened, what you expected, and any URLs or transaction IDs.'} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          uploads.add(e.dataTransfer.files);
        }}
        className="w-full rounded-md border border-dashed border-auth-line2 p-3.5 text-center text-[12.5px] text-auth-text3 hover:border-auth-accent"
      >
        Drop screenshots or files here, or click to choose · up to 10 MB each
      </button>
      <input ref={fileRef} type="file" multiple accept={ACCEPTED_FILES} className="hidden" onChange={(e) => e.target.files && (uploads.add(e.target.files), (e.target.value = ''))} />
      <FileChips uploads={uploads} />
      {error && <p role="alert" className="mt-3 text-[12.5px] text-auth-bad">{error}</p>}
    </Modal>
  );
}

export function GrantModal({ ticket, onClose, onDone }: { ticket: TicketDetail | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!ticket || !Number(amount)) return;
    setBusy(true);
    try {
      const r = await apiClient.post<{ balance: number }>(`/tickets/${ticket.id}/credits`, { amount: Number(amount), note: note.trim() || undefined });
      toast(`Added ${fmtNumber(Number(amount))} credits — balance now ${fmtNumber(r.balance)}`);
      setAmount('');
      setNote('');
      onDone();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={ticket !== null} onClose={onClose} title={`Add credit · ${ticket?.client.name ?? ''}`} width={440} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!Number(amount)} onClick={() => void submit()}>Add credits</Button></>}>
      <Field label="Credits"><Input autoFocus mono inputMode="numeric" placeholder="1,000" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>
      <Field label="Note" hint="Shown on the ticket and in the client’s credit history." className="mb-0">
        <Input placeholder="e.g. bKash BJK7X2R4P1" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

/** Pick another open ticket of the same client to fold this one into. */
export function MergeModal({ ticket, onClose, onMerged }: { ticket: TicketDetail | null; onClose: () => void; onMerged: (targetId: string) => void }) {
  const toast = useToast();
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const candidates = useApi<TicketList>(ticket ? `/tickets?view=all&clientId=${ticket.client.id}&limit=50` : null);
  const options = useMemo(() => (candidates.data?.items ?? []).filter((t) => t.id !== ticket?.id && t.status !== 'closed'), [candidates.data, ticket]);

  async function submit() {
    if (!ticket || !targetId) return;
    setBusy(true);
    try {
      const r = await apiClient.post<{ id: string; number: string }>(`/tickets/${ticket.id}/merge`, { targetId });
      toast(`Merged ${ticket.number} into ${r.number}`);
      setTargetId('');
      onMerged(r.id);
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={ticket !== null}
      onClose={onClose}
      title={`Merge ${ticket?.number ?? ''} into another ticket`}
      width={520}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!targetId} onClick={() => void submit()}>Merge and close {ticket?.number}</Button></>}
    >
      <p className="mb-3 text-[13px] text-auth-text2">
        Every message moves to the ticket you pick, tags are combined, and {ticket?.number} closes with a link to it. This can’t be undone.
      </p>
      {candidates.loading && !candidates.data ? (
        <Skeleton className="h-24" />
      ) : options.length === 0 ? (
        <p className="rounded-md border border-auth-line p-3.5 text-[13px] text-auth-text3">{ticket?.client.name} has no other open tickets to merge into.</p>
      ) : (
        <div role="radiogroup" aria-label="Target ticket" className="grid gap-1.5">
          {options.map((t) => (
            <button key={t.id} role="radio" aria-checked={targetId === t.id} onClick={() => setTargetId(t.id)} className={cn('rounded-md border px-3 py-2.5 text-left', targetId === t.id ? 'border-auth-accent bg-auth-accent-soft' : 'border-auth-line hover:border-auth-line2')}>
              <span className="flex items-center justify-between gap-2">
                <b className="truncate text-[13px] font-medium">{t.subject}</b>
                <Pill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Pill>
              </span>
              <span className="text-xs text-auth-text3"><span className="font-mono">{t.number}</span> · {cap(t.category)} · updated {relativeTime(t.lastMessageAt)}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Searchable macro list in a popover; picking one hands it to the composer. */
export function MacroPicker({ onPick }: { onPick: (m: Macro) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const macros = useApi<Macro[]>(open ? '/support/macros' : null);
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

  const term = q.trim().toLowerCase();
  const shown = (macros.data ?? []).filter((m) => !term || m.title.toLowerCase().includes(term) || m.body.toLowerCase().includes(term));

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} className="inline-flex items-center gap-1.5 hover:text-auth-text2" onClick={() => setOpen((v) => !v)}>
        <Icon.macro className="h-3.5 w-3.5" /> Macros
      </button>
      {open && (
        <div role="dialog" aria-label="Macros" className="absolute bottom-7 left-0 z-50 w-[min(380px,calc(100vw-48px))] overflow-hidden rounded-lg border border-auth-line2 bg-auth-surface shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]">
          <div className="border-b border-auth-line p-2">
            <Input autoFocus aria-label="Search macros" placeholder="Search macros" value={q} onChange={(e) => setQ(e.target.value)} className="py-1.5 text-[12.5px]" />
          </div>
          <div className="max-h-72 overflow-auto">
            {macros.loading && !macros.data ? (
              <div className="p-2"><Skeleton className="h-14" /></div>
            ) : shown.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12.5px] text-auth-text3">
                {macros.data?.length ? 'No macros match.' : 'No macros yet.'} <a href="/tickets/macros" className="text-auth-accent">Manage macros</a>
              </p>
            ) : (
              shown.map((m) => (
                <button key={m.id} className="block w-full border-b border-auth-line px-3 py-2.5 text-left last:border-b-0 hover:bg-auth-surface2" onClick={() => { onPick(m); setOpen(false); setQ(''); }}>
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate text-[13px] font-medium">{m.title}</b>
                    <span className="text-[11px] text-auth-text3">{m.shared ? 'Team' : 'Personal'}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[12px] text-auth-text3">{m.body}</span>
                  <MacroActionsLine actions={m.actions} />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function MacroActionsLine({ actions }: { actions: Macro['actions'] }) {
  const parts = [
    actions.status && `status → ${STATUS[actions.status].label.toLowerCase()}`,
    actions.priority && `priority → ${PRIORITY[actions.priority].label.toLowerCase()}`,
    actions.addTags?.length && `tag ${actions.addTags.join(', ')}`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <span className="mt-1 block text-[11px] text-auth-accent">Also: {parts.join(' · ')}</span>;
}
