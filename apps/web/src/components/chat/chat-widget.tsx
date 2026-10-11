'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar, EmptyState, Skeleton } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { Composer, MessageList, waHref, type ComposerHandle } from '@/components/chat/thread';
import { useUser } from '@/lib/user-context';
import { useChat } from '@/lib/use-chat';
import { cn } from '@/lib/utils';

/**
 * Floating live chat for clients: a button in the bottom-right corner that
 * opens a popup conversation with their manager. It lives in the dashboard
 * layout, so it survives navigation; the shared socket stays connected while
 * closed so the unread badge updates live, and messages are only marked read
 * while the popup is actually open.
 */
export function ChatWidget() {
  const me = useUser();
  const [open, setOpenState] = useState(false);
  const chat = useChat(me.id, { active: open });
  const composer = useRef<ComposerHandle>(null);
  const conversation = chat.conversations?.[0] ?? null;
  const unread = chat.conversations?.reduce((sum, c) => sum + c.unread, 0) ?? 0;

  // Remembered for the browser session so a refresh doesn't close an ongoing conversation.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('fx-chat-open') === '1') setOpenState(true);
    } catch {
      /* storage unavailable — default closed */
    }
  }, []);
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) =>
    setOpenState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      try {
        sessionStorage.setItem('fx-chat-open', value ? '1' : '0');
      } catch {
        /* ignore */
      }
      return value;
    });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const peer = conversation?.peer;
  const firstName = peer?.name.split(' ')[0] ?? 'your manager';
  const isOnline = peer ? (chat.online[peer.id] ?? false) : false;
  const away = peer?.availability === 'away';
  const isTyping = conversation ? (chat.typing[conversation.id] ?? false) : false;
  const wa = waHref(peer?.whatsapp);

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label={`Chat with ${peer?.name ?? 'your manager'}`}
          className="fixed inset-x-2 bottom-20 z-50 flex h-[min(600px,calc(100vh-7rem))] flex-col overflow-hidden rounded-xl border border-auth-line2 bg-auth-surface shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] sm:inset-x-auto sm:right-5.5 sm:w-[380px]"
        >
          <header className="flex items-center gap-3 border-b border-auth-line bg-auth-bg2 px-4 py-3">
            {peer ? (
              <>
                <span className="relative">
                  <Avatar name={peer.name} tone="fox" />
                  <i className={cn('absolute -right-px -bottom-px h-2.5 w-2.5 rounded-full border-2 border-auth-bg2', away ? 'bg-auth-warn' : isOnline ? 'bg-auth-ok' : 'bg-auth-text3')} />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-medium">{peer.name}</b>
                  <span className={cn('text-xs', isTyping || (isOnline && !away) ? 'text-auth-ok' : away ? 'text-auth-warn' : 'text-auth-text3')}>
                    {isTyping ? 'typing…' : away ? 'Away · will reply when back' : isOnline ? 'Online · usually replies within the hour' : 'Offline · gets your message by email'}
                  </span>
                </div>
              </>
            ) : (
              <b className="flex-1 text-[14px] font-medium">Live chat</b>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${firstName}`} title={`WhatsApp ${firstName}`} className="flex h-8 w-8 items-center justify-center rounded-md text-auth-ok hover:bg-auth-surface2">
                <Icon.whatsapp className="h-4 w-4" />
              </a>
            )}
            <Link href="/chat" onClick={() => setOpen(false)} aria-label="Open full chat" title="Open full chat" className="flex h-8 w-8 items-center justify-center rounded-md text-auth-text3 hover:bg-auth-surface2 hover:text-auth-text">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.75 w-3.75" aria-hidden="true">
                <path d="M9.5 2.5h4v4M13.5 2.5L8 8M6.5 3.5h-3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-3" />
              </svg>
            </Link>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="flex h-8 w-8 items-center justify-center rounded-md text-auth-text3 hover:bg-auth-surface2 hover:text-auth-text">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </svg>
            </button>
          </header>

          {!chat.connected && conversation && <div className="bg-auth-warn-soft px-4 py-1.5 text-center text-xs text-auth-warn">Reconnecting…</div>}

          {chat.conversations === null ? (
            <div className="grid gap-3 p-4">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="ml-auto h-10 w-2/3" />
            </div>
          ) : !conversation || !peer ? (
            <div className="flex flex-1 items-center">
              <EmptyState title="No manager assigned yet">You&apos;ll be able to chat here as soon as your account manager is assigned.</EmptyState>
            </div>
          ) : (
            <>
              <MessageList
                messages={chat.messages}
                meId={me.id}
                meName={me.name}
                peerName={peer.name}
                peerTone="fox"
                meTone="violet"
                typing={isTyping}
                maxWidth="85%"
                conversationId={conversation.id}
                hasMore={chat.hasMore}
                loadingOlder={chat.loadingOlder}
                onLoadOlder={() => void chat.loadOlder()}
                onQuickReply={(id, answer) => void chat.send(answer, { replyTo: id })}
                onRetry={(m) => void chat.retry(m)}
                onDiscard={chat.discard}
                canAnswerQuickReplies
              />
              {chat.messages.length === 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                  {['Hi! I have a question about my URLs.', 'I’d like to top up credits.', 'A URL is stuck on Submitted.'].map((q) => (
                    <button key={q} onClick={() => composer.current?.insert(q)} className="rounded-full border border-auth-accent/50 px-2.5 py-1 text-xs text-auth-accent hover:bg-auth-accent-soft">
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <Composer ref={composer} placeholder={`Message ${firstName}…`} onSend={chat.send} onTyping={chat.notifyTyping} footerLeft="Enter to send · paste or drop files" />
            </>
          )}
        </section>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close live chat' : unread ? `Open live chat, ${unread} unread` : 'Open live chat'}
        aria-expanded={open}
        className="fixed right-5.5 bottom-5.5 z-50 flex h-12.5 w-12.5 items-center justify-center rounded-full bg-auth-accent shadow-[0_10px_30px_-8px_rgba(107,140,255,0.7)] transition-transform hover:scale-105"
      >
        {open ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        ) : (
          <Icon.chat className="h-5.5 w-5.5 text-white" />
        )}
        {!open && unread > 0 && (
          <em className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border-2 border-auth-bg bg-auth-fox px-1 text-[11px] font-semibold text-[#1a1208] not-italic">
            {unread}
          </em>
        )}
      </button>
    </>
  );
}
