'use client';

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Avatar, Pill } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { apiClient } from '@/lib/api-client';
import { ACCEPTED_FILES, fmtBytes, uploadFile } from '@/lib/upload';
import type { Attachment, ChatMessage } from '@/lib/api-types';
import type { SendOptions } from '@/lib/use-chat';
import { cn } from '@/lib/utils';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Plain text with URLs turned into safe links — no HTML is ever injected. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="break-all text-auth-accent underline-offset-2 hover:underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

interface UrlStatus {
  url: string;
  status: 'indexed' | 'submitted' | 'queued' | 'failed' | 'unknown';
  attempts: number;
  lastError: string | null;
}

const URL_TONE = { indexed: 'ok', submitted: 'info', queued: 'muted', failed: 'bad', unknown: 'muted' } as const;
const URL_LABEL = { indexed: 'Indexed', submitted: 'Submitted', queued: 'Queued', failed: 'Failed', unknown: 'Not submitted' } as const;

/** Looks up submission status for URLs mentioned in messages (the client's own URLs only). */
function useUrlStatuses(conversationId: string | undefined, messages: ChatMessage[]) {
  const [statuses, setStatuses] = useState<Record<string, UrlStatus>>({});
  const asked = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!conversationId) return;
    const found = new Set<string>();
    for (const m of messages.slice(-60)) for (const u of m.body.match(URL_RE) ?? []) if (!asked.current.has(u)) found.add(u);
    const urls = [...found].slice(0, 20);
    if (urls.length === 0) return;
    urls.forEach((u) => asked.current.add(u));
    apiClient
      .post<UrlStatus[]>(`/chat/conversations/${conversationId}/url-status`, { urls })
      .then((rows) => setStatuses((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.url, r])) })))
      .catch(() => undefined);
  }, [conversationId, messages]);

  return statuses;
}

export function AttachmentView({ files }: { files: Attachment[] }) {
  if (files.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) =>
        f.isImage ? (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-auth-line">
            <img src={f.url} alt={f.fileName} className="max-h-44 min-h-16 max-w-[220px] min-w-16 bg-auth-bg object-contain" loading="lazy" />
          </a>
        ) : (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="inline-flex max-w-[240px] items-center gap-2 rounded-md border border-auth-line bg-auth-bg px-2.5 py-1.75 text-[12.5px] hover:border-auth-line2">
            <Icon.clip className="h-3.5 w-3.5 flex-shrink-0 text-auth-text3" />
            <span className="truncate">{f.fileName}</span>
            <span className="flex-shrink-0 text-auth-text3">{fmtBytes(f.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function MessageList({
  messages,
  meId,
  meName,
  peerName,
  peerTone,
  meTone,
  typing,
  highlight,
  maxWidth = '70%',
  conversationId,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onQuickReply,
  onRetry,
  onDiscard,
  canAnswerQuickReplies,
}: {
  messages: ChatMessage[];
  meId: string;
  meName: string;
  peerName: string;
  peerTone: 'fox' | 'accent';
  meTone: 'violet' | 'fox';
  typing: boolean;
  highlight?: string;
  maxWidth?: string;
  conversationId?: string;
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  onQuickReply?: (messageId: string, answer: string) => void;
  onRetry?: (m: ChatMessage) => void;
  onDiscard?: (m: ChatMessage) => void;
  canAnswerQuickReplies?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const firstId = messages[0]?.id;
  const urlStatuses = useUrlStatuses(conversationId, messages);

  // Loading older messages must not jump the view: keep the same message under the user's eyes.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el && prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    }
  }, [firstId]);

  useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, typing]);

  let lastDay = '';
  const needle = highlight?.trim().toLowerCase();

  return (
    <div
      ref={scrollerRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="flex-1 overflow-auto px-4.5 py-5"
      aria-live="polite"
    >
      <div className="grid gap-3.5">
        {hasMore && (
          <button
            onClick={() => {
              prevHeight.current = scrollerRef.current?.scrollHeight ?? null;
              onLoadOlder?.();
            }}
            disabled={loadingOlder}
            className="mx-auto rounded-full border border-auth-line px-3 py-1 text-xs text-auth-text3 hover:border-auth-line2 hover:text-auth-text2 disabled:opacity-50"
          >
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}
        {messages.length === 0 && <p className="py-10 text-center text-[13px] text-auth-text3">No messages yet — say hello.</p>}
        {messages.map((m) => {
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;

          if (m.meta?.system === 'ticket_created') {
            return (
              <div key={m.id} className="contents">
                {showDay && <DaySep label={day} />}
                <div className="text-center text-[12px] text-auth-text3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-auth-surface2 px-3 py-1">
                    <Icon.ticket className="h-3.5 w-3.5" />
                    {m.senderName ? `${m.senderName} · ` : ''}
                    Ticket{' '}
                    <Link href={`/tickets?id=${m.meta.ticketId}`} className="font-mono text-auth-accent hover:underline">{m.meta.ticketNumber}</Link> created from this chat
                  </span>
                </div>
              </div>
            );
          }

          const mine = m.senderId === meId;
          const hit = needle && m.body.toLowerCase().includes(needle);
          const otherName = m.senderName && m.senderName !== peerName ? m.senderName : peerName;
          const urls = [...new Set(m.body.match(URL_RE) ?? [])].map((u) => urlStatuses[u]).filter((s): s is UrlStatus => Boolean(s));
          const quick = m.meta?.quickReplies;
          return (
            <div key={m.id} className="contents">
              {showDay && <DaySep label={day} />}
              <div className={cn('flex items-end gap-2.5', mine && 'ml-auto flex-row-reverse', m.pending && 'opacity-70')} style={{ maxWidth }}>
                <Avatar name={mine ? meName : otherName} size={26} tone={mine ? meTone : peerTone} />
                <div className="min-w-0">
                  {!mine && m.senderName && m.senderName !== peerName && <div className="mb-0.5 text-[11px] text-auth-text3">{m.senderName}</div>}
                  <div
                    className={cn(
                      'rounded-xl px-3.25 py-2.25 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap',
                      mine ? 'rounded-br-[4px] bg-auth-accent-soft' : 'rounded-bl-[4px] bg-auth-surface2',
                      m.failed && 'ring-1 ring-auth-bad/60',
                      hit && 'ring-2 ring-auth-warn',
                    )}
                  >
                    {m.body && <Linkified text={m.body} />}
                    <AttachmentView files={m.attachments ?? []} />
                    {urls.map((u) => (
                      <div key={u.url} className="mt-2 grid gap-1.25 rounded-lg border border-auth-line bg-auth-bg px-2.75 py-2.25 text-[12.5px] whitespace-normal">
                        <span className="truncate font-mono text-xs">{u.url.replace(/^https?:\/\//, '')}</span>
                        <span className="flex flex-wrap items-center gap-2 text-auth-text3">
                          <Pill tone={URL_TONE[u.status]}>{URL_LABEL[u.status]}</Pill>
                          {u.attempts > 0 && <span>{u.attempts} {u.attempts === 1 ? 'try' : 'tries'}</span>}
                          {u.lastError && <span className="truncate text-auth-bad">{u.lastError}</span>}
                        </span>
                      </div>
                    ))}
                    {quick && quick.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {quick.map((q) => {
                          const answered = m.meta?.answered;
                          const chosen = answered === q;
                          const clickable = canAnswerQuickReplies && !mine && !answered && !m.pending;
                          return (
                            <button
                              key={q}
                              type="button"
                              disabled={!clickable}
                              onClick={() => clickable && onQuickReply?.(m.id, q)}
                              className={cn(
                                'rounded-full border px-2.75 py-1 text-[12.5px] whitespace-normal transition-colors',
                                chosen ? 'border-auth-accent bg-auth-accent text-white' : 'border-auth-accent/70 text-auth-accent',
                                clickable ? 'hover:bg-auth-accent-soft' : !chosen && 'opacity-50',
                              )}
                            >
                              {q}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className={cn('mt-1 text-[11.5px] text-auth-text3', mine && 'text-right')}>
                    {m.failed ? (
                      <span className="text-auth-bad">
                        {m.failed}{' '}
                        <button className="underline" onClick={() => onRetry?.(m)}>Retry</button>
                        {' · '}
                        <button className="underline" onClick={() => onDiscard?.(m)}>Discard</button>
                      </span>
                    ) : m.pending ? (
                      'Sending…'
                    ) : (
                      <>
                        {time(m.createdAt)}
                        {mine && (m.readAt ? <span className="text-auth-accent"> · Seen</span> : <span> · Sent</span>)}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="flex items-end gap-2.5">
            <Avatar name={peerName} size={26} tone={peerTone} />
            <div className="inline-flex gap-1 rounded-xl rounded-bl-[4px] bg-auth-surface2 px-3.5 py-3" aria-label={`${peerName} is typing`}>
              {[0, 1, 2].map((i) => (
                <i key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-auth-text3" style={{ animationDelay: `${i * 200}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function DaySep({ label }: { label: string }) {
  return (
    <div className="my-1.5 text-center text-[11.5px] text-auth-text3">
      <span className="rounded-full bg-auth-surface2 px-2.5 py-0.75">{label}</span>
    </div>
  );
}

export interface ComposerHandle {
  insert: (text: string) => void;
}

interface PendingFile {
  key: string;
  name: string;
  progress: number;
  attachment?: Attachment;
  error?: string;
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    placeholder: string;
    disabled?: boolean;
    onSend: (body: string, opts: SendOptions) => Promise<void>;
    onTyping: () => void;
    footerLeft: ReactNode;
    footerRight?: ReactNode;
    cannedReplies?: { key: string; text: string }[];
    /** Staff can attach up to 4 tap-to-answer buttons. */
    allowQuickReplies?: boolean;
  }
>(function Composer({ placeholder, disabled, onSend, onTyping, footerLeft, footerRight, cannedReplies, allowQuickReplies }, ref) {
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [buttons, setButtons] = useState<string[] | null>(null);
  const [buttonDraft, setButtonDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Send pressed while files were still uploading — fire as soon as they finish. */
  const [sendQueued, setSendQueued] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    insert: (text: string) => {
      setDraft(text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  }));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const slash = draft.startsWith('/') && !draft.includes(' ') && cannedReplies ? cannedReplies.filter((c) => c.key.startsWith(draft.slice(1).toLowerCase())) : [];
  const uploading = files.some((f) => !f.attachment && !f.error);
  const ready = files.filter((f) => f.attachment).map((f) => f.attachment!);
  const canSend = (draft.trim().length > 0 || ready.length > 0) && !uploading && !disabled;
  const canTrigger = (draft.trim().length > 0 || files.some((f) => !f.error)) && !disabled;

  function addFiles(list: FileList | File[]) {
    setError(null);
    const incoming = [...list].slice(0, 5 - files.length);
    for (const file of incoming) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      setFiles((prev) => [...prev, { key, name: file.name, progress: 0 }]);
      uploadFile(file, (progress) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, progress } : f))))
        .then((attachment) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, attachment, progress: 100 } : f))))
        .catch((e: Error) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, error: e.message } : f))));
    }
  }

  function trigger() {
    if (canSend) void submit();
    else if (uploading && canTrigger) setSendQueued(true);
  }

  useEffect(() => {
    if (!sendQueued || uploading) return;
    setSendQueued(false);
    // A failed upload cancels the queued send so the error chip is seen, not silently dropped.
    if (files.some((f) => f.error)) setError('An attachment failed to upload — remove it or try again.');
    else if (canSend) void submit();
    // Deliberately keyed on the upload state settling, not on every draft change.
  }, [sendQueued, uploading]);

  async function submit() {
    if (!canSend) return;
    const body = draft.trim();
    const quickReplies = buttons?.filter(Boolean);
    setDraft('');
    setFiles([]);
    setButtons(null);
    setButtonDraft('');
    setError(null);
    try {
      await onSend(body, { attachments: ready, quickReplies: quickReplies?.length ? quickReplies : undefined });
    } catch (e) {
      setError((e as Error).message);
    }
    textareaRef.current?.focus();
  }

  return (
    <div
      className="relative border-t border-auth-line px-4.5 py-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {slash.length > 0 && (
        <div className="absolute right-4.5 bottom-full left-4.5 mb-1 overflow-hidden rounded-lg border border-auth-line bg-auth-surface2 shadow-lg" role="listbox">
          {slash.map((c) => (
            <button key={c.key} type="button" className="block w-full px-3 py-2 text-left text-[13px] hover:bg-auth-surface" onClick={() => setDraft(c.text)}>
              <b className="font-mono text-auth-accent">/{c.key}</b> <span className="text-auth-text3">{c.text.slice(0, 70)}…</span>
            </button>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f) => (
            <span key={f.key} className={cn('inline-flex max-w-[220px] items-center gap-1.5 rounded-md border px-2 py-1 text-xs', f.error ? 'border-auth-bad/50 text-auth-bad' : 'border-auth-line text-auth-text2')}>
              <Icon.clip className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{f.error ?? f.name}</span>
              {!f.attachment && !f.error && <span className="text-auth-text3">{f.progress}%</span>}
              <button aria-label={`Remove ${f.name}`} className="text-auth-text3 hover:text-auth-text" onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}>×</button>
            </span>
          ))}
        </div>
      )}

      {buttons !== null && (
        <div className="mb-2 rounded-lg border border-auth-line bg-auth-bg2 p-2">
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {buttons.map((b) => (
              <span key={b} className="inline-flex items-center gap-1 rounded-full border border-auth-accent/70 px-2.5 py-0.75 text-xs text-auth-accent">
                {b}
                <button aria-label={`Remove ${b}`} onClick={() => setButtons((prev) => prev?.filter((x) => x !== b) ?? null)}>×</button>
              </span>
            ))}
            {buttons.length === 0 && <span className="text-xs text-auth-text3">Reply buttons the client can tap (up to 4)</span>}
          </div>
          {buttons.length < 4 && (
            <input
              value={buttonDraft}
              maxLength={40}
              placeholder="Type a button label and press Enter"
              aria-label="Reply button label"
              onChange={(e) => setButtonDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = buttonDraft.trim();
                  if (v && !buttons.includes(v)) setButtons([...buttons, v]);
                  setButtonDraft('');
                }
              }}
              className="w-full rounded-md border border-auth-line bg-auth-bg px-2 py-1 text-xs text-auth-text outline-none focus:border-auth-accent"
            />
          )}
        </div>
      )}

      <div className="flex items-end gap-1.5 rounded-lg border border-auth-line bg-auth-bg py-2 pr-2 pl-3 focus-within:border-auth-accent focus-within:ring-3 focus-within:ring-auth-accent-soft">
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          disabled={disabled}
          maxLength={4000}
          aria-label="Message"
          onChange={(e) => {
            setDraft(e.target.value);
            onTyping();
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (slash.length === 1) setDraft(slash[0].text);
              else trigger();
            }
          }}
          placeholder={placeholder}
          className="max-h-30 min-h-6 flex-1 resize-none bg-transparent py-1 leading-normal text-auth-text outline-none placeholder:text-auth-text3"
        />
        {allowQuickReplies && (
          <button type="button" aria-label="Add reply buttons" title="Add reply buttons" onClick={() => setButtons((b) => (b === null ? [] : null))} className={cn('flex h-8 w-8 items-center justify-center rounded-md hover:bg-auth-surface2', buttons !== null ? 'text-auth-accent' : 'text-auth-text3')}>
            <Icon.list className="h-4 w-4" />
          </button>
        )}
        <button type="button" aria-label="Attach files" title="Attach files (or paste / drop)" onClick={() => fileRef.current?.click()} disabled={files.length >= 5} className="flex h-8 w-8 items-center justify-center rounded-md text-auth-text3 hover:bg-auth-surface2 hover:text-auth-text disabled:opacity-40">
          <Icon.clip className="h-4 w-4" />
        </button>
        <input ref={fileRef} type="file" multiple accept={ACCEPTED_FILES} className="hidden" onChange={(e) => e.target.files && (addFiles(e.target.files), (e.target.value = ''))} />
        <button
          type="button"
          onClick={trigger}
          disabled={!canTrigger || sendQueued}
          aria-label={sendQueued ? 'Sending when upload finishes' : 'Send'}
          title={uploading && canTrigger ? 'Sends as soon as the upload finishes' : undefined}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-auth-accent text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon.arrowRight className="h-3.75 w-3.75" />
        </button>
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[11.5px] text-auth-text3">
        <span>{error ? <span role="alert" className="text-auth-bad">{error}</span> : footerLeft}</span>
        {footerRight && <span className="text-right">{footerRight}</span>}
      </div>
    </div>
  );
});

export function waHref(whatsapp: string | null | undefined): string | null {
  const digits = whatsapp?.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}
