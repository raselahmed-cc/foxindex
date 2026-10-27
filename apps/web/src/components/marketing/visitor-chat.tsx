'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const STORAGE_KEY = 'foxindex.visitorChat';

interface Msg {
  id: string;
  senderType: 'visitor' | 'staff' | 'system';
  senderName: string;
  body: string;
  createdAt: string;
}

const FIELD =
  'w-full rounded-md border border-auth-line bg-auth-bg2 px-3 py-2 text-[13.5px] text-auth-text outline-none placeholder:text-auth-text3 focus:border-auth-accent focus:ring-2 focus:ring-auth-accent-soft';

// The token is a per-browser convenience so the conversation survives a reload; storage may be unavailable.
function readToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — chat still works for this page view
  }
}

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.token ? { 'x-visitor-token': init.token } : {}), ...init.headers },
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: { message?: string; details?: unknown } };
  if (!json.success) {
    const err = new Error(json.error?.message ?? 'Something went wrong — please try again.') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json.data as T;
}

/** Floating pre-sales chat for visitors who aren't signed in. */
export function VisitorChat() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [unread, setUnread] = useState(0);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', website: '' });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Resume an earlier conversation from this browser.
  useEffect(() => {
    const saved = readToken();
    if (!saved) return;
    api<{ messages: Msg[] }>('/public/chat/messages', { token: saved })
      .then((r) => {
        setToken(saved);
        setMessages(r.messages);
      })
      .catch(() => writeToken(null));
  }, []);

  // Live staff replies.
  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(`${API_URL}/visitor`, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('visitor:message', (m: Msg) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      if (!openRef.current && m.senderType === 'staff') setUnread((n) => n + 1);
    });
    socket.on('visitor:invalid', () => {
      writeToken(null);
      setToken(null);
    });
    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [open, messages.length]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ token: string; messages: Msg[] }>('/public/chat/start', {
        method: 'POST',
        body: JSON.stringify({ ...form, phone: form.phone || undefined, website: form.website || undefined, page: `${window.location.pathname}${window.location.hash}` }),
      });
      writeToken(r.token);
      setToken(r.token);
      setMessages(r.messages);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !token) return;
    setDraft('');
    setError(null);
    try {
      const m = await api<Msg>('/public/chat/messages', { method: 'POST', token, body: JSON.stringify({ body }) });
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (err) {
      setDraft(body);
      setError((err as Error & { status?: number }).status === 401 ? 'This chat expired — start a new one.' : (err as Error).message);
      if ((err as Error & { status?: number }).status === 401) {
        writeToken(null);
        setToken(null);
      }
    }
  }

  function startOver() {
    writeToken(null);
    setToken(null);
    setMessages([]);
  }

  const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Chat with FoxIndex"
          className="fixed right-4 bottom-24 z-50 flex h-[min(560px,calc(100vh-120px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-auth-line2 bg-auth-surface shadow-[0_30px_70px_-20px_rgba(0,0,0,0.9)] sm:right-6"
        >
          <div className="flex items-center justify-between gap-3 border-b border-auth-line bg-auth-bg2 px-4 py-3">
            <div>
              <b className="block text-[14.5px] font-semibold">Chat with FoxIndex</b>
              <span className="text-xs text-auth-ok">Our team usually replies within minutes</span>
            </div>
            <button aria-label="Close chat" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-auth-text3 hover:bg-auth-surface2 hover:text-auth-text">✕</button>
          </div>

          {!token ? (
            <form onSubmit={start} className="flex flex-1 flex-col gap-2.5 overflow-auto p-4">
              <p className="mb-1 text-[13px] text-auth-text2">Questions about pricing, Google indexing or getting started? Leave your details and we’ll reply right here.</p>
              <label className="sr-only" htmlFor="vc-name">Your name</label>
              <input id="vc-name" required minLength={2} maxLength={80} placeholder="Your name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={FIELD} />
              <label className="sr-only" htmlFor="vc-email">Email</label>
              <input id="vc-email" required type="email" placeholder="Email address" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={FIELD} />
              <label className="sr-only" htmlFor="vc-phone">WhatsApp (optional)</label>
              <input id="vc-phone" type="tel" maxLength={32} placeholder="WhatsApp number (optional)" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={FIELD} />
              <label className="sr-only" htmlFor="vc-message">Message</label>
              <textarea id="vc-message" required maxLength={2000} rows={4} placeholder="How can we help?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={cn(FIELD, 'resize-none')} />
              {/* Honeypot: hidden from people, often filled by bots. */}
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />
              {error && <p role="alert" className="text-[12.5px] text-auth-bad">{error}</p>}
              <button type="submit" disabled={busy} className="mt-auto rounded-md bg-auth-accent py-2.5 text-sm font-medium text-white hover:bg-auth-accent2 disabled:opacity-60">
                {busy ? 'Starting…' : 'Start chat'}
              </button>
              <p className="text-center text-[11.5px] text-auth-text3">Already a customer? <a href="/login" className="text-auth-accent">Log in</a> to chat with your account manager.</p>
            </form>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-auto p-4" aria-live="polite">
                {messages.map((m) =>
                  m.senderType === 'system' ? (
                    <p key={m.id} className="text-center text-[11.5px] text-auth-text3">{m.body}</p>
                  ) : (
                    <div key={m.id} className={cn('max-w-[85%]', m.senderType === 'visitor' ? 'ml-auto text-right' : '')}>
                      <div className={cn('inline-block rounded-xl px-3 py-2 text-left text-[13.5px] whitespace-pre-wrap break-words', m.senderType === 'visitor' ? 'bg-auth-accent-soft' : 'bg-auth-surface2')}>{m.body}</div>
                      <div className="mt-0.5 text-[11px] text-auth-text3">{m.senderType === 'staff' ? `${m.senderName} · ` : ''}{time(m.createdAt)}</div>
                    </div>
                  ),
                )}
                {messages.length > 0 && messages[messages.length - 1].senderType === 'visitor' && (
                  <p className="text-center text-[11.5px] text-auth-text3">Thanks — someone from our team will reply here shortly.</p>
                )}
                <div ref={endRef} />
              </div>
              {error && <p role="alert" className="px-4 pb-1 text-[12.5px] text-auth-bad">{error}</p>}
              <form onSubmit={send} className="flex gap-2 border-t border-auth-line p-3">
                <label className="sr-only" htmlFor="vc-draft">Message</label>
                <input id="vc-draft" maxLength={2000} placeholder="Type a message…" value={draft} onChange={(e) => setDraft(e.target.value)} className={FIELD} />
                <button type="submit" disabled={!draft.trim()} className="rounded-md bg-auth-accent px-3.5 text-sm font-medium text-white hover:bg-auth-accent2 disabled:opacity-50">Send</button>
              </form>
              <button onClick={startOver} className="pb-2 text-[11.5px] text-auth-text3 hover:text-auth-text2">Start a new conversation</button>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : unread ? `Open chat, ${unread} new` : 'Chat with us'}
        className="fixed right-4 bottom-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-auth-accent text-white shadow-[0_12px_30px_-8px_rgba(107,140,255,0.8)] hover:bg-auth-accent2 sm:right-6"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 5h16v11H9l-5 4V5z" />}
        </svg>
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-auth-bad px-1 text-[11px] font-semibold">{unread}</span>
        )}
      </button>
    </>
  );
}
