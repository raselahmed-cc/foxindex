'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { apiClient } from './api-client';
import { acquireChatSocket, releaseChatSocket } from './chat-socket';
import { playChime, showDesktop } from './notifier';
import type { ChatMessage } from './api-types';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

interface RealtimeState {
  socket: Socket | null;
  connected: boolean;
  notifications: AppNotification[];
  unreadNotifications: number;
  markNotificationsRead: (ids?: string[]) => Promise<void>;
  /** Chat UIs register while a conversation is on screen so we don't chime for what the user is reading. */
  setChatFocus: (conversationId: string | null) => void;
  /** Bumped on ticket/conversation changes so pages can refetch. */
  ticketsVersion: number;
  conversationsVersion: number;
}

const RealtimeContext = createContext<RealtimeState>({
  socket: null,
  connected: false,
  notifications: [],
  unreadNotifications: 0,
  markNotificationsRead: async () => undefined,
  setChatFocus: () => undefined,
  ticketsVersion: 0,
  conversationsVersion: 0,
});

/**
 * App-wide live layer: one socket for every role, the notification bell feed,
 * sounds + desktop alerts, and a tab-title unread counter. Pages read
 * versions from here to refetch when the server says something changed.
 */
export function RealtimeProvider({ meId, role, children, onBadgesStale }: { meId: string; role: string; children: ReactNode; onBadgesStale: () => void }) {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [ticketsVersion, setTicketsVersion] = useState(0);
  const [conversationsVersion, setConversationsVersion] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const focusRef = useRef<string | null>(null);
  const staleRef = useRef(onBadgesStale);
  staleRef.current = onBadgesStale;

  useEffect(() => {
    apiClient
      .get<{ unread: number; items: AppNotification[] }>('/notifications?limit=30')
      .then((r) => {
        setNotifications(r.items);
        setUnread(r.unread);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const s = acquireChatSocket();
    setSocket(s);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onNotification = (n: AppNotification) => {
      setNotifications((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 50));
      setUnread((u) => u + 1);
      playChime();
      showDesktop(n.title, n.body, { tag: n.id, onClick: () => n.link && router.push(n.link) });
      if (n.type.startsWith('ticket')) setTicketsVersion((v) => v + 1);
      staleRef.current();
    };
    const onMessage = (m: ChatMessage) => {
      if (m.senderId === meId) return;
      // Admins also receive every conversation as supervisors — only chime for their own threads (the chat page focuses those).
      if ((role === 'admin' || role === 'superadmin') && focusRef.current !== m.conversationId) {
        staleRef.current();
        return;
      }
      const viewing = focusRef.current === m.conversationId && document.visibilityState === 'visible';
      if (!viewing) {
        playChime();
        setChatUnread((n) => n + 1);
        showDesktop(`New message from ${m.senderName ?? 'FoxIndex'}`, m.body || 'Sent an attachment', { tag: `chat-${m.conversationId}`, onClick: () => router.push('/chat') });
      }
      staleRef.current();
    };
    const onTicket = () => {
      setTicketsVersion((v) => v + 1);
      staleRef.current();
    };
    const onConversations = () => {
      s.emit('rooms:refresh');
      setConversationsVersion((v) => v + 1);
      staleRef.current();
    };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('notification:new', onNotification);
    s.on('message:new', onMessage);
    s.on('ticket:updated', onTicket);
    s.on('conversations:changed', onConversations);
    if (s.connected) onConnect();
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('notification:new', onNotification);
      s.off('message:new', onMessage);
      s.off('ticket:updated', onTicket);
      s.off('conversations:changed', onConversations);
      releaseChatSocket();
    };
  }, [meId, role, router]);

  // "(3) FoxIndex" while there's something unseen and the tab is in the background.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    const total = chatUnread + unread;
    document.title = total > 0 ? `(${total}) ${base}` : base;
    const onVisible = () => document.visibilityState === 'visible' && setChatUnread(0);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [chatUnread, unread]);

  const markNotificationsRead = useCallback(async (ids?: string[]) => {
    setNotifications((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    await apiClient.post('/notifications/read', ids ? { ids } : {}).catch(() => undefined);
  }, []);

  const setChatFocus = useCallback((conversationId: string | null) => {
    focusRef.current = conversationId;
    if (conversationId) setChatUnread(0);
  }, []);

  const value = useMemo<RealtimeState>(
    () => ({ socket, connected, notifications, unreadNotifications: unread, markNotificationsRead, setChatFocus, ticketsVersion, conversationsVersion }),
    [socket, connected, notifications, unread, markNotificationsRead, setChatFocus, ticketsVersion, conversationsVersion],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
