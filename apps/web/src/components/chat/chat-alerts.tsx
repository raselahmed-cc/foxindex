'use client';

import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/dash/ui';
import { openClientChat } from '@/lib/chat-launcher';

export interface ChatAlert {
  /** Conversation or visitor-chat key — a newer message from the same chat replaces the older card. */
  key: string;
  name: string;
  preview: string;
  href: string;
  /** "Website visitor" label for pre-sales chats. */
  tag?: string;
  at: number;
}

/**
 * Live pop-ups for new chat messages, shown on any page except the conversation
 * already on screen. Click opens the chat; they fade on their own after 8 s.
 */
export function ChatAlerts({ alerts, onDismiss }: { alerts: ChatAlert[]; onDismiss: (key: string) => void }) {
  const router = useRouter();
  if (!alerts.length) return null;
  return (
    <div aria-live="polite" className="fixed top-16 right-3 left-3 z-[90] flex flex-col gap-2 md:top-[76px] md:right-6 md:left-auto md:w-[360px]">
      {alerts.map((a) => (
        <div
          key={a.key}
          role="status"
          className="flex items-start gap-3 rounded-xl border border-auth-line2 bg-auth-surface p-3.5 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.9)]"
        >
          <button
            type="button"
            onClick={() => {
              onDismiss(a.key);
              if (!openClientChat(a.href)) router.push(a.href);
            }}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <Avatar name={a.name} size={34} tone={a.tag ? 'fox' : 'accent'} />
            <span className="min-w-0 flex-1">
              <b className="flex items-center gap-1.5 text-[13.5px] font-medium">
                <span className="truncate">{a.name}</span>
                {a.tag && <span className="flex-shrink-0 rounded-full bg-auth-fox-soft px-1.75 py-0.25 text-[10.5px] text-auth-fox">{a.tag}</span>}
              </b>
              <span className="mt-0.5 line-clamp-2 block text-[13px] text-auth-text2">{a.preview}</span>
              <span className="mt-1.5 block text-xs font-medium text-auth-accent">Reply →</span>
            </span>
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => onDismiss(a.key)} className="rounded-md px-1.5 text-auth-text3 hover:bg-auth-surface2 hover:text-auth-text">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
