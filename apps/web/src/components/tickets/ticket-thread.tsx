'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar, Button, Card, Checkbox, Drawer, ErrorBanner, Pill, Select, Skeleton, Textarea } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { AttachmentView } from '@/components/chat/thread';
import { useUser } from '@/lib/user-context';
import { useRealtime } from '@/lib/realtime-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { ACCEPTED_FILES } from '@/lib/upload';
import { fmtDateTime, fmtNumber, relativeTime } from '@/lib/format';
import { PRIORITY, STATUS, cap, renderMacro, type Macro, type TicketDetail, type TicketPriority, type TicketStatus } from '@/lib/tickets';
import { cn } from '@/lib/utils';
import { GrantModal, MacroActionsLine, MacroPicker, MergeModal } from './dialogs';
import { FileChips, SlaBadge, Stars, TagEditor, useNow, useTicketViewers, useUploads } from './parts';

const isDone = (s: TicketStatus) => s === 'resolved' || s === 'closed';

function DueLine({ label, due, doneAt, breached }: { label: string; due: string | null; doneAt?: string | null; breached?: boolean }) {
  const now = useNow();
  if (!due) return null;
  const dueMs = new Date(due).getTime();
  let state: { text: string; cls: string };
  if (doneAt) state = new Date(doneAt).getTime() <= dueMs ? { text: `Met · ${fmtDateTime(doneAt)}`, cls: 'text-auth-ok' } : { text: `Missed · ${fmtDateTime(doneAt)}`, cls: 'text-auth-bad' };
  else if (breached || dueMs <= now) state = { text: `Overdue · was due ${fmtDateTime(due)}`, cls: 'text-auth-bad' };
  else state = { text: `Due ${fmtDateTime(due)}`, cls: 'text-auth-text2' };
  return (
    <div className="flex justify-between gap-3 text-[12.5px]">
      <span className="text-auth-text3">{label}</span>
      <span className={cn('text-right', state.cls)}>{state.text}</span>
    </div>
  );
}

/** Customer + SLA context, shown inline on wide screens and in a drawer otherwise. */
function DetailsPanel({ t }: { t: TicketDetail }) {
  return (
    <div className="grid gap-5">
      <section>
        <h4 className="mb-2 text-xs font-medium text-auth-text3">Client</h4>
        <div className="flex items-center gap-2.5">
          <Avatar name={t.client.name} size={32} />
          <div className="min-w-0">
            <b className="block truncate text-[13.5px] font-medium">{t.client.name}</b>
            <span className="block truncate text-xs text-auth-text3">{t.client.email}</span>
          </div>
        </div>
        <dl className="mt-3 grid gap-1.5 text-[12.5px]">
          {t.client.company && <div className="flex justify-between gap-2"><dt className="text-auth-text3">Company</dt><dd>{t.client.company}</dd></div>}
          <div className="flex justify-between gap-2"><dt className="text-auth-text3">Credits</dt><dd className="font-mono">{fmtNumber(t.client.creditBalanceCached ?? 0)}</dd></div>
          {t.client.createdAt && <div className="flex justify-between gap-2"><dt className="text-auth-text3">Customer since</dt><dd>{new Date(t.client.createdAt).toLocaleDateString()}</dd></div>}
          {t.manager && <div className="flex justify-between gap-2"><dt className="text-auth-text3">Assignee</dt><dd>{t.manager.name}</dd></div>}
          {t.site && <div className="flex justify-between gap-2"><dt className="text-auth-text3">Site</dt><dd className="truncate font-mono">{t.site.domain}</dd></div>}
        </dl>
        {t.client.whatsapp && (
          <a href={`https://wa.me/${t.client.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${t.client.name.split(' ')[0]}, about ticket ${t.number}`)}`} target="_blank" rel="noreferrer" className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] text-auth-accent">
            <Icon.whatsapp className="h-3.5 w-3.5" /> Message on WhatsApp
          </a>
        )}
      </section>

      {t.sla && (
        <section>
          <h4 className="mb-2 text-xs font-medium text-auth-text3">Service level · {PRIORITY[t.priority].label.toLowerCase()} priority</h4>
          <div className="grid gap-1.5">
            <DueLine label="First reply" due={t.sla.firstResponseDueAt} doneAt={t.source === 'staff' ? null : t.firstResponseAt} breached={t.sla.firstResponseBreached} />
            <DueLine label="Resolution" due={t.sla.resolutionDueAt} doneAt={t.resolvedAt} breached={t.sla.resolutionBreached} />
            {t.sla.paused && !isDone(t.status) && <p className="text-[12px] text-auth-text3">Resolution clock paused while waiting on the client.</p>}
          </div>
        </section>
      )}

      {t.csat && (
        <section>
          <h4 className="mb-2 text-xs font-medium text-auth-text3">Satisfaction</h4>
          <Stars value={t.csat.rating} size="sm" />
          {t.csat.comment && <p className="mt-1.5 text-[12.5px] text-auth-text2">“{t.csat.comment}”</p>}
        </section>
      )}

      {t.related && t.related.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-medium text-auth-text3">Other tickets from {t.client.name.split(' ')[0]}</h4>
          <ul className="grid gap-1.5">
            {t.related.map((r) => (
              <li key={r.id}>
                <Link href={`/tickets?id=${r.id}`} className="block rounded-md border border-auth-line px-2.5 py-2 hover:border-auth-line2">
                  <span className="block truncate text-[12.5px]">{r.subject}</span>
                  <span className="text-[11.5px] text-auth-text3"><span className="font-mono">{r.number}</span> · {STATUS[r.status].label} · {relativeTime(r.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CsatCard({ t, onRated }: { t: TicketDetail; onRated: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(t.csat?.rating ?? 0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!t.csat);

  async function submit() {
    if (!rating) return;
    setBusy(true);
    try {
      await apiClient.post(`/tickets/${t.id}/csat`, { rating, comment: comment.trim() || undefined });
      toast('Thanks for the feedback');
      setEditing(false);
      onRated();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (!editing && t.csat) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-auth-line bg-auth-bg2 px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] text-auth-text2">You rated this <Stars value={t.csat.rating} size="sm" /></span>
        <button className="text-[12.5px] text-auth-accent" onClick={() => setEditing(true)}>Change rating</button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-auth-line bg-auth-bg2 px-4 py-3.5">
      <b className="text-[13.5px] font-medium">How did we do?</b>
      <p className="mb-2 text-[12.5px] text-auth-text3">Your rating goes to the support team lead, not just your manager.</p>
      <Stars value={rating} onChange={setRating} />
      {rating > 0 && (
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
          <Textarea aria-label="Comment (optional)" className="min-h-10 flex-1 bg-auth-bg" placeholder={rating <= 3 ? 'What could we have done better? (optional)' : 'Anything to add? (optional)'} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()} className="self-end">Send rating</Button>
        </div>
      )}
    </div>
  );
}

export function TicketThread({ ticketId, onBack, onChanged, onOpen }: { ticketId: string; onBack: () => void; onChanged: () => void; onOpen: (id: string) => void }) {
  const me = useUser();
  const toast = useToast();
  const { ticketsVersion } = useRealtime();
  const staff = me.role !== 'client';
  const isAdmin = me.role === 'admin' || me.role === 'superadmin';
  const detail = useApi<TicketDetail>(`/tickets/${ticketId}`);
  const managers = useApi<{ id: string; name: string }[]>(isAdmin ? '/admin/managers' : null);
  const uploads = useUploads();
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [macro, setMacro] = useState<Macro | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<'grant' | 'merge' | 'details' | null>(null);
  const { reload } = detail;
  const t = detail.data;

  const viewers = useTicketViewers(ticketId, me.id, staff, body.trim().length > 0);
  const replyingOthers = viewers.filter((v) => v.state === 'replying');

  useEffect(() => {
    void reload();
  }, [ticketsVersion, reload]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [detail.data?.messages.length]);

  function pickMacro(m: Macro) {
    if (!t) return;
    const text = renderMacro(m.body, { clientName: t.client.name, agentName: me.name, ticketNumber: t.number, subject: t.subject });
    setBody((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text));
    setMacro(m);
  }

  async function send(resolve: boolean) {
    if (!t || (!body.trim() && uploads.ids.length === 0)) return;
    setBusy(resolve ? 'resolve' : 'send');
    try {
      await apiClient.post(`/tickets/${t.id}/messages`, { body: body.trim(), attachmentIds: uploads.ids, internal: staff && internal, resolve, macroId: macro?.id });
      setBody('');
      uploads.clear();
      setInternal(false);
      setMacro(null);
      await reload();
      onChanged();
      if (resolve) toast('Replied and marked resolved');
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  }

  async function patch(update: Record<string, unknown>, message: string) {
    if (!t) return;
    try {
      await apiClient.patch(`/tickets/${t.id}`, update);
      toast(message, 'info');
      await reload();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  if (detail.error) return <Card className="p-4"><ErrorBanner message="Could not load this ticket." onRetry={() => void reload()} /></Card>;
  if (!t) return <Card className="p-4.5"><Skeleton className="h-60" /></Card>;

  const closed = t.status === 'closed';
  const done = isDone(t.status);
  const statusLabel = !staff && STATUS[t.status].clientLabel ? STATUS[t.status].clientLabel : STATUS[t.status].label;

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <div className="border-b border-auth-line px-4.5 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button className="mb-1 text-[12.5px] text-auth-text3 lg:hidden" onClick={onBack}>← All tickets</button>
            <h3 className="text-[15px] font-semibold">{t.subject}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-auth-text3">
              <span className="font-mono">{t.number}</span>·<span>{cap(t.category)}</span>·
              <span className={PRIORITY[t.priority].className}>{PRIORITY[t.priority].label} priority</span>·
              <span>Opened {fmtDateTime(t.createdAt)}</span>
              {t.site && <>·<span className="font-mono">{t.site.domain}</span></>}
              {staff ? <>·<span>Client <b className="font-medium text-auth-text2">{t.client.name}</b></span></> : t.manager && <>·<span>Assigned to <b className="font-medium text-auth-text2">{t.manager.name}</b></span></>}
              {t.conversationId && <>·<Link href="/chat" className="text-auth-accent">From live chat</Link></>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={STATUS[t.status].tone}>{statusLabel}</Pill>
            {staff ? (
              <>
                <Select aria-label="Status" value={t.status} disabled={Boolean(t.mergedInto)} onChange={(e) => void patch({ status: e.target.value }, `Status set to ${STATUS[e.target.value as TicketStatus].label}`)} className="w-auto py-1.25 text-[12.5px]">
                  {(Object.keys(STATUS) as TicketStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
                </Select>
                <Select aria-label="Priority" value={t.priority} disabled={Boolean(t.mergedInto)} onChange={(e) => void patch({ priority: e.target.value }, `Priority set to ${e.target.value} — SLA targets updated`)} className="w-auto py-1.25 text-[12.5px]">
                  {(['urgent', 'high', 'normal', 'low'] as TicketPriority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
                </Select>
                {isAdmin && (
                  <Select aria-label="Assigned manager" value={t.manager?.id ?? ''} onChange={(e) => void patch({ assignedManagerId: e.target.value || null }, e.target.value ? 'Ticket reassigned' : 'Ticket unassigned')} className="w-auto py-1.25 text-[12.5px]">
                    <option value="">Unassigned</option>
                    {managers.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                )}
                <Button size="sm" onClick={() => setModal('grant')}>Add credit</Button>
                {!t.mergedInto && !closed && <Button size="sm" onClick={() => setModal('merge')} title="Merge into another ticket"><Icon.merge className="h-3.5 w-3.5" /> Merge</Button>}
                <Button size="sm" className="2xl:hidden" onClick={() => setModal('details')}>Details</Button>
              </>
            ) : done ? (
              !closed && <Button size="sm" onClick={() => void patch({ status: 'open' }, 'Ticket reopened')}>Reopen</Button>
            ) : (
              <Button size="sm" onClick={() => void patch({ status: 'resolved' }, 'Marked resolved — thanks!')}>Mark resolved</Button>
            )}
          </div>
        </div>

        {staff && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <SlaBadge sla={t.sla?.current} />
            <TagEditor tags={t.tags} disabled={Boolean(t.mergedInto)} onChange={(tags) => void patch({ tags }, 'Tags updated')} />
            {viewers.length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-auth-text3" aria-live="polite">
                <Icon.eye className="h-3.5 w-3.5" />
                {viewers.map((v) => v.name.split(' ')[0]).join(', ')} {viewers.length === 1 ? 'is' : 'are'} here
              </span>
            )}
          </div>
        )}
        {!staff && t.expectedReplyBy && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-auth-text2">
            <Icon.clock className="h-3.5 w-3.5 text-auth-text3" /> Expect a first reply by {fmtDateTime(t.expectedReplyBy)}
          </p>
        )}
        {t.mergedInto && (
          <p className="mt-2.5 rounded-md border border-auth-line bg-auth-bg2 px-3 py-2 text-[12.5px] text-auth-text2">
            This ticket was merged into{' '}
            <button className="font-mono text-auth-accent" onClick={() => onOpen(t.mergedInto!.id)}>{t.mergedInto.number}</button>. Continue the conversation there.
          </p>
        )}
      </div>

      <div className={cn('grid min-h-0 flex-1', staff && '2xl:grid-cols-[minmax(0,1fr)_270px]')}>
        <div className="flex min-h-0 flex-col">
          <div className="flex-1 overflow-auto px-4.5 py-5">
            <div className="grid gap-4.5">
              {t.messages.map((m) => {
                if (m.kind === 'event') {
                  const bad = m.meta && (m.meta as { breached?: boolean }).breached;
                  return (
                    <div key={m.id} className={cn('text-center text-xs', bad ? 'text-auth-bad' : 'text-auth-text3')}>
                      <b className={cn('font-medium', bad ? 'text-auth-bad' : 'text-auth-text2')}>{m.senderName}</b> · {m.body} · {fmtDateTime(m.createdAt)}
                    </div>
                  );
                }
                const mine = m.senderId === me.id;
                const fromStaff = m.senderRole !== 'client';
                return (
                  <div key={m.id} className={cn('flex max-w-[78%] gap-2.5', mine && 'ml-auto flex-row-reverse')}>
                    <Avatar name={m.senderName} size={28} tone={fromStaff ? 'fox' : 'accent'} />
                    <div className="min-w-0">
                      <div className={cn('rounded-[10px] px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap', m.internal ? 'border border-auth-warn/40 bg-auth-warn-soft' : mine ? 'bg-auth-accent-soft' : 'bg-auth-surface2')}>
                        {m.internal && <div className="mb-1 text-[11px] font-medium text-auth-warn">Internal note · staff only</div>}
                        {m.body}
                        <AttachmentView files={m.attachments} />
                      </div>
                      <div className={cn('mt-1.25 text-xs text-auth-text3', mine && 'text-right')}>
                        {mine ? 'You' : `${m.senderName}${fromStaff ? ' · Support' : ''}`} · {fmtDateTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-auth-line px-4.5 py-3.5">
            {!staff && done && t.csatEnabled && <div className="mb-3"><CsatCard t={t} onRated={() => void reload()} /></div>}
            {closed ? (
              <p className="text-center text-[13px] text-auth-text3">This ticket is closed. {!staff && <>Need more help? <Link href="/tickets?new=1" className="text-auth-accent">Open a new ticket</Link>.</>}</p>
            ) : (
              <>
                {replyingOthers.length > 0 && (
                  <p role="status" className="mb-2 rounded-md border border-auth-warn/40 bg-auth-warn-soft px-3 py-1.5 text-[12.5px] text-auth-warn">
                    {replyingOthers.map((v) => v.name).join(', ')} {replyingOthers.length === 1 ? 'is' : 'are'} writing a reply — check before you send.
                  </p>
                )}
                <Textarea
                  aria-label="Reply"
                  className={cn('min-h-21 bg-auth-bg', internal && 'border-auth-warn/40 bg-auth-warn-soft')}
                  placeholder={internal ? 'Internal note — only staff can see this' : done && !staff ? 'Reply to reopen this ticket…' : 'Write a reply… Ctrl+Enter to send'}
                  value={body}
                  maxLength={10_000}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void send(false);
                    }
                  }}
                  onPaste={(e) => {
                    if (e.clipboardData.files.length) {
                      e.preventDefault();
                      uploads.add(e.clipboardData.files);
                    }
                  }}
                />
                <FileChips uploads={uploads} />
                {macro && (
                  <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-auth-line bg-auth-bg2 px-2.5 py-1.5 text-[12px]">
                    <span>
                      Using macro <b className="font-medium">{macro.title}</b>
                      <MacroActionsLine actions={macro.actions} />
                    </span>
                    <button aria-label="Stop using macro" className="text-auth-text3 hover:text-auth-text" onClick={() => setMacro(null)}>×</button>
                  </div>
                )}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-3.5 text-[12.5px] text-auth-text3">
                    <button className="inline-flex items-center gap-1.5 hover:text-auth-text2" onClick={() => fileRef.current?.click()}>
                      <Icon.clip className="h-3.5 w-3.5" /> Attach
                    </button>
                    <input ref={fileRef} type="file" multiple accept={ACCEPTED_FILES} className="hidden" onChange={(e) => e.target.files && (uploads.add(e.target.files), (e.target.value = ''))} />
                    {staff && <MacroPicker onPick={pickMacro} />}
                    {staff && <Checkbox checked={internal} onChange={setInternal}>Internal note</Checkbox>}
                  </div>
                  <div className="flex gap-2">
                    {!internal && !done && (
                      <Button size="sm" loading={busy === 'resolve'} disabled={uploads.uploading || (!body.trim() && uploads.ids.length === 0)} onClick={() => void send(true)}>
                        Reply and resolve
                      </Button>
                    )}
                    <Button size="sm" variant="primary" loading={busy === 'send'} disabled={uploads.uploading || (!body.trim() && uploads.ids.length === 0)} onClick={() => void send(false)}>
                      {internal ? 'Add note' : 'Send reply'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {staff && (
          <aside className="hidden overflow-auto border-l border-auth-line p-4.5 2xl:block" aria-label="Ticket details">
            <DetailsPanel t={t} />
          </aside>
        )}
      </div>

      <GrantModal ticket={modal === 'grant' ? t : null} onClose={() => setModal(null)} onDone={() => { setModal(null); void reload(); onChanged(); }} />
      <MergeModal ticket={modal === 'merge' ? t : null} onClose={() => setModal(null)} onMerged={(id) => { setModal(null); onChanged(); onOpen(id); }} />
      <Drawer open={modal === 'details'} onClose={() => setModal(null)} title="Ticket details" subtitle={t.number}>
        <DetailsPanel t={t} />
      </Drawer>
    </Card>
  );
}
