'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/dash/icons';
import { Pill } from '@/components/dash/ui';
import { useRealtime } from '@/lib/realtime-context';
import { useApi } from '@/lib/use-api';
import { uploadFile } from '@/lib/upload';
import type { Attachment } from '@/lib/api-types';
import { slaBadge, type SlaSummary } from '@/lib/tickets';
import { cn } from '@/lib/utils';

/** A clock that re-renders every `ms` — SLA countdowns stay honest without refetching. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function SlaBadge({ sla, className }: { sla: SlaSummary | null | undefined; className?: string }) {
  const now = useNow();
  if (!sla) return null;
  const b = slaBadge(sla, now);
  return (
    <span title={b.title} className={cn('inline-flex', className)}>
      <Pill tone={b.tone} dot={false}>
        <Icon.clock className="mr-1 h-3 w-3" />
        {b.text}
      </Pill>
    </span>
  );
}

export function TagChips({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags.length) return null;
  return (
    <span className="inline-flex min-w-0 flex-wrap gap-1">
      {tags.slice(0, max).map((t) => (
        <span key={t} className="rounded border border-auth-line px-1.5 py-px text-[11px] text-auth-text2">{t}</span>
      ))}
      {tags.length > max && <span className="text-[11px] text-auth-text3">+{tags.length - max}</span>}
    </span>
  );
}

const TAG_RE = /^[a-z0-9][a-z0-9 _-]*$/;

/** Inline tag editor with autocomplete from tags already in use. */
export function TagEditor({ tags, onChange, disabled }: { tags: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const listId = useId();
  const known = useApi<{ tag: string; count: number }[]>('/tickets/tags');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    if (tag.length > 32 || !TAG_RE.test(tag)) return setError('Letters, numbers, spaces, - and _ (max 32)');
    if (tags.length >= 10) return setError('Up to 10 tags');
    setError(null);
    setDraft('');
    if (!tags.includes(tag)) onChange([...tags, tag]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Icon.tag className="h-3.5 w-3.5 text-auth-text3" />
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded border border-auth-line px-1.5 py-0.5 text-xs text-auth-text2">
          {t}
          {!disabled && (
            <button aria-label={`Remove tag ${t}`} className="text-auth-text3 hover:text-auth-text" onClick={() => onChange(tags.filter((x) => x !== t))}>
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <>
          <input
            list={listId}
            value={draft}
            aria-label="Add tag"
            placeholder={tags.length ? 'Add tag' : 'Add a tag'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add(draft);
              }
            }}
            onBlur={() => draft && add(draft)}
            className="w-24 bg-transparent py-0.5 text-xs text-auth-text outline-none placeholder:text-auth-text3 [&::-webkit-calendar-picker-indicator]:hidden"
          />
          <datalist id={listId}>{known.data?.filter((k) => !tags.includes(k.tag)).map((k) => <option key={k.tag} value={k.tag} />)}</datalist>
        </>
      )}
      {error && <span role="alert" className="text-[11.5px] text-auth-bad">{error}</span>}
    </div>
  );
}

/** Upload queue shared by the new-ticket form and the reply box. */
export function useUploads() {
  const [files, setFiles] = useState<{ key: string; name: string; progress: number; attachment?: Attachment; error?: string }[]>([]);
  const add = (list: FileList | File[]) => {
    for (const file of [...list].slice(0, 5)) {
      const key = `${file.name}-${Math.random()}`;
      setFiles((prev) => [...prev, { key, name: file.name, progress: 0 }]);
      uploadFile(file, (progress) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, progress } : f))))
        .then((attachment) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, attachment } : f))))
        .catch((e: Error) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, error: e.message } : f))));
    }
  };
  return {
    files,
    add,
    remove: (key: string) => setFiles((prev) => prev.filter((f) => f.key !== key)),
    clear: () => setFiles([]),
    uploading: files.some((f) => !f.attachment && !f.error),
    ids: files.filter((f) => f.attachment).map((f) => f.attachment!.id),
  };
}

export function FileChips({ uploads }: { uploads: ReturnType<typeof useUploads> }) {
  if (uploads.files.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {uploads.files.map((f) => (
        <span key={f.key} className={cn('inline-flex max-w-[240px] items-center gap-1.5 rounded-md border px-2 py-1 text-xs', f.error ? 'border-auth-bad/50 text-auth-bad' : 'border-auth-line text-auth-text2')}>
          <Icon.clip className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{f.error ?? f.name}</span>
          {!f.attachment && !f.error && <span className="text-auth-text3">{f.progress}%</span>}
          <button aria-label={`Remove ${f.name}`} onClick={() => uploads.remove(f.key)}>×</button>
        </span>
      ))}
    </div>
  );
}

/** 1–5 star input (radio group semantics) or read-only display. */
export function Stars({ value, onChange, size = 'md' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'md' }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-6 w-6';
  if (!onChange) {
    return (
      <span className="inline-flex gap-0.5" aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => <Icon.star key={n} className={cn(cls, n <= value ? 'fill-auth-fox text-auth-fox' : 'text-auth-line2')} />)}
      </span>
    );
  }
  return (
    <span role="radiogroup" aria-label="Rating" className="inline-flex gap-1" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} className="rounded p-0.5 focus-visible:ring-2 focus-visible:ring-auth-accent">
          <Icon.star className={cn(cls, n <= shown ? 'fill-auth-fox text-auth-fox' : 'text-auth-line2')} />
        </button>
      ))}
    </span>
  );
}

export interface TicketViewer {
  id: string;
  name: string;
  state: 'viewing' | 'replying';
}

/**
 * Agent collision presence: announces this agent on the ticket (viewing or
 * replying), refreshes the lease every 20 s, and returns the *other* staff on it.
 */
export function useTicketViewers(ticketId: string, meId: string, enabled: boolean, replying: boolean): TicketViewer[] {
  const { socket } = useRealtime();
  const [viewers, setViewers] = useState<TicketViewer[]>([]);
  const replyingRef = useRef(replying);
  replyingRef.current = replying;

  useEffect(() => {
    if (!socket || !enabled) return;
    const onViewers = (p: { ticketId: string; viewers: TicketViewer[] }) => p.ticketId === ticketId && setViewers(p.viewers);
    const announce = () => socket.emit('ticket:viewing', { ticketId, state: replyingRef.current ? 'replying' : 'viewing' });
    socket.on('ticket:viewers', onViewers);
    socket.on('connect', announce);
    announce();
    const t = setInterval(announce, 20_000);
    return () => {
      clearInterval(t);
      socket.off('ticket:viewers', onViewers);
      socket.off('connect', announce);
      socket.emit('ticket:viewing', { ticketId, state: 'left' });
      setViewers([]);
    };
  }, [socket, enabled, ticketId]);

  useEffect(() => {
    if (socket && enabled) socket.emit('ticket:viewing', { ticketId, state: replying ? 'replying' : 'viewing' });
  }, [replying, socket, enabled, ticketId]);

  return viewers.filter((v) => v.id !== meId);
}
