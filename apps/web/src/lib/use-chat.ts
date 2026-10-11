'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from './api-client';
import { useRealtime } from './realtime-context';
import type { Attachment, ChatMessage, Conversation } from './api-types';

const TYPING_IDLE_MS = 2000;
const TYPING_STALE_MS = 6000;
const SEND_TIMEOUT_MS = 10_000;

const SEND_ERRORS: Record<string, string> = {
  RATE_LIMITED: 'You’re sending messages too fast — wait a few seconds.',
  INVALID_MESSAGE: 'Message is empty or too long.',
  ATTACHMENT_INVALID: 'An attachment expired — attach it again.',
  REPLY_INVALID: 'That option is no longer available.',
  FORBIDDEN: 'You can’t send messages in this conversation.',
};

function sortByTime(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Server copies win; an optimistic copy is replaced when its clientId comes back. */
function merge(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) {
    if (m.clientId) {
      const optimistic = [...byId.values()].find((x) => x.clientId === m.clientId && x.pending !== undefined);
      if (optimistic) byId.delete(optimistic.id);
    }
    byId.set(m.id, { ...byId.get(m.id), ...m, pending: undefined, failed: undefined });
  }
  return sortByTime([...byId.values()]);
}

export interface SendOptions {
  attachments?: Attachment[];
  quickReplies?: string[];
  replyTo?: string;
}

/**
 * Live-chat state for one signed-in user: conversations (unread counts and
 * previews kept current from socket events), paged history, presence,
 * typing, read receipts, optimistic sending with retry. `active` = the thread
 * is on screen (the popup stays connected while closed). Admins can pass
 * scope "all" to supervise every conversation.
 */
export function useChat(meId: string, { active = true, scope = 'mine' }: { active?: boolean; scope?: 'mine' | 'all' } = {}) {
  const { socket, setChatFocus, conversationsVersion } = useRealtime();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState(false);

  const selectedRef = useRef<string | null>(null);
  const activeRef = useRef(active);
  const loadedRef = useRef<Set<string>>(new Set());
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const myTyping = useRef<{ conversationId: string | null; timer: ReturnType<typeof setTimeout> | null }>({ conversationId: null, timer: null });
  const everConnected = useRef(false);
  selectedRef.current = selectedId;
  activeRef.current = active;

  const loadConversations = useCallback(async () => {
    const rows = await apiClient.get<Conversation[]>(`/chat/conversations${scope === 'all' ? '?scope=all' : ''}`).catch(() => null);
    if (!rows) {
      setConversations((prev) => prev ?? []);
      return;
    }
    setConversations(rows);
    setSelectedId((current) => (current && rows.some((r) => r.id === current) ? current : (rows[0]?.id ?? null)));
  }, [scope]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const res = await apiClient.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/chat/conversations/${conversationId}/messages`).catch(() => null);
    if (!res) return;
    loadedRef.current.add(conversationId);
    setMessages((prev) => ({ ...prev, [conversationId]: merge(prev[conversationId] ?? [], res.messages) }));
    setHasMore((prev) => ({ ...prev, [conversationId]: prev[conversationId] ?? res.hasMore }));
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations, conversationsVersion]);

  useEffect(() => {
    if (selectedId && !loadedRef.current.has(selectedId)) void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    setChatFocus(active ? selectedId : null);
    return () => setChatFocus(null);
  }, [active, selectedId, setChatFocus]);

  useEffect(() => {
    if (!selectedId || !active) return;
    setConversations((prev) => prev?.map((c) => (c.id === selectedId ? { ...c, unread: 0 } : c)) ?? prev);
  }, [selectedId, active]);

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => {
      setConnected(true);
      if (everConnected.current) {
        void loadConversations();
        loadedRef.current.forEach((id) => void loadMessages(id));
      }
      everConnected.current = true;
    };
    const onDisconnect = () => setConnected(false);

    const onMessageNew = (msg: ChatMessage) => {
      setMessages((prev) => ({ ...prev, [msg.conversationId]: merge(prev[msg.conversationId] ?? [], [msg]) }));
      const viewing = activeRef.current && msg.conversationId === selectedRef.current && document.visibilityState === 'visible';
      setConversations((prev) => {
        if (!prev) return prev;
        if (!prev.some((c) => c.id === msg.conversationId)) {
          void loadConversations();
          return prev;
        }
        return prev
          .map((c) =>
            c.id === msg.conversationId
              ? { ...c, lastMessage: { body: msg.body || '📎 Attachment', senderId: msg.senderId, createdAt: msg.createdAt }, unread: msg.senderId !== meId && !viewing ? c.unread + 1 : c.unread }
              : c,
          )
          .sort((a, b) => (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? ''));
      });
      if (msg.senderId !== meId) {
        setTyping((prev) => ({ ...prev, [msg.conversationId]: false }));
        if (viewing) socket.emit('read', { conversationId: msg.conversationId });
      }
    };

    const onTyping = ({ conversationId, userId, isTyping }: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (userId === meId) return;
      setTyping((prev) => ({ ...prev, [conversationId]: isTyping }));
      clearTimeout(typingTimers.current[conversationId]);
      if (isTyping) typingTimers.current[conversationId] = setTimeout(() => setTyping((prev) => ({ ...prev, [conversationId]: false })), TYPING_STALE_MS);
    };

    const onPresence = ({ userId, online: isOnline }: { userId: string; online: boolean }) => setOnline((prev) => ({ ...prev, [userId]: isOnline }));

    const onReadAck = ({ conversationId, messageIds }: { conversationId: string; messageIds: string[] }) => {
      const ids = new Set(messageIds);
      const now = new Date().toISOString();
      setMessages((prev) => ({ ...prev, [conversationId]: (prev[conversationId] ?? []).map((m) => (ids.has(m.id) ? { ...m, readAt: m.readAt ?? now } : m)) }));
    };

    const onVisible = () => {
      if (activeRef.current && document.visibilityState === 'visible' && selectedRef.current) {
        socket.emit('read', { conversationId: selectedRef.current });
        setConversations((prev) => prev?.map((c) => (c.id === selectedRef.current ? { ...c, unread: 0 } : c)) ?? prev);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message:new', onMessageNew);
    socket.on('typing', onTyping);
    socket.on('presence:update', onPresence);
    socket.on('read:ack', onReadAck);
    document.addEventListener('visibilitychange', onVisible);
    if (socket.connected) {
      setConnected(true);
      everConnected.current = true;
    }

    const timers = typingTimers.current;
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message:new', onMessageNew);
      socket.off('typing', onTyping);
      socket.off('presence:update', onPresence);
      socket.off('read:ack', onReadAck);
      document.removeEventListener('visibilitychange', onVisible);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [socket, meId, loadConversations, loadMessages]);

  const current = selectedId ? (messages[selectedId] ?? []) : [];

  useEffect(() => {
    if (!selectedId || !connected || !active) return;
    if (current.some((m) => m.senderId !== meId && !m.readAt && !m.pending)) socket?.emit('read', { conversationId: selectedId });
  }, [selectedId, current, meId, connected, active, socket]);

  const loadOlder = useCallback(async () => {
    const conversationId = selectedRef.current;
    if (!conversationId || loadingOlder) return;
    const oldest = (messages[conversationId] ?? []).find((m) => !m.pending);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const res = await apiClient.get<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/chat/conversations/${conversationId}/messages?before=${encodeURIComponent(oldest.createdAt)}`,
      );
      setMessages((prev) => ({ ...prev, [conversationId]: merge(prev[conversationId] ?? [], res.messages) }));
      setHasMore((prev) => ({ ...prev, [conversationId]: res.hasMore }));
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, loadingOlder]);

  const notifyTyping = useCallback(() => {
    const conversationId = selectedRef.current;
    if (!socket || !conversationId) return;
    const state = myTyping.current;
    if (state.conversationId !== conversationId) {
      if (state.conversationId) socket.emit('typing', { conversationId: state.conversationId, isTyping: false });
      socket.emit('typing', { conversationId, isTyping: true });
      state.conversationId = conversationId;
    }
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      socket.emit('typing', { conversationId, isTyping: false });
      state.conversationId = null;
    }, TYPING_IDLE_MS);
  }, [socket]);

  const stopTyping = useCallback(() => {
    const state = myTyping.current;
    if (state.timer) clearTimeout(state.timer);
    if (state.conversationId) socket?.emit('typing', { conversationId: state.conversationId, isTyping: false });
    state.conversationId = null;
  }, [socket]);

  const emitSend = useCallback(
    (conversationId: string, clientId: string, body: string, opts: SendOptions) =>
      new Promise<void>((resolve, reject) => {
        if (!socket?.connected) return reject(new Error('You’re offline — it will send when you reconnect. Tap retry.'));
        socket
          .timeout(SEND_TIMEOUT_MS)
          .emit(
            'message:send',
            { conversationId, body, clientId, attachmentIds: (opts.attachments ?? []).map((a) => a.id), quickReplies: opts.quickReplies, replyTo: opts.replyTo },
            (err: Error | null, res?: { ok?: boolean; error?: string; message?: ChatMessage }) => {
              if (err) return reject(new Error('Not sent — the server did not respond.'));
              if (!res?.ok) return reject(new Error(SEND_ERRORS[res?.error ?? ''] ?? 'Message not sent.'));
              if (res.message) setMessages((prev) => ({ ...prev, [conversationId]: merge(prev[conversationId] ?? [], [res.message!]) }));
              resolve();
            },
          );
      }),
    [socket],
  );

  /** Adds an optimistic "sending…" copy immediately; it becomes the real message on ack or shows "Failed · Retry". */
  const send = useCallback(
    async (body: string, opts: SendOptions = {}) => {
      const conversationId = selectedRef.current;
      if (!conversationId) throw new Error('No conversation selected');
      stopTyping();
      const clientId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: ChatMessage = {
        id: clientId,
        clientId,
        conversationId,
        senderId: meId,
        body,
        readAt: null,
        createdAt: new Date().toISOString(),
        attachments: opts.attachments,
        meta: opts.quickReplies?.length ? { quickReplies: opts.quickReplies } : null,
        pending: true,
      };
      setMessages((prev) => ({ ...prev, [conversationId]: sortByTime([...(prev[conversationId] ?? []), optimistic]) }));
      try {
        await emitSend(conversationId, clientId, body, opts);
        if (opts.replyTo) {
          setMessages((prev) => ({
            ...prev,
            [conversationId]: (prev[conversationId] ?? []).map((m) => (m.id === opts.replyTo ? { ...m, meta: { ...m.meta, answered: body } } : m)),
          }));
        }
      } catch (error) {
        setMessages((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).map((m) => (m.clientId === clientId && m.pending ? { ...m, pending: false, failed: (error as Error).message } : m)),
        }));
      }
    },
    [meId, emitSend, stopTyping],
  );

  const retry = useCallback(
    async (message: ChatMessage) => {
      const conversationId = message.conversationId;
      setMessages((prev) => ({ ...prev, [conversationId]: (prev[conversationId] ?? []).filter((m) => m.id !== message.id) }));
      await send(message.body, { attachments: message.attachments, quickReplies: message.meta?.quickReplies });
    },
    [send],
  );

  const discard = useCallback((message: ChatMessage) => {
    setMessages((prev) => ({ ...prev, [message.conversationId]: (prev[message.conversationId] ?? []).filter((m) => m.id !== message.id) }));
  }, []);

  const updateConversation = useCallback((id: string, patch: Partial<Conversation>) => {
    setConversations((prev) => prev?.map((c) => (c.id === id ? { ...c, ...patch } : c)) ?? prev);
  }, []);

  return {
    conversations,
    selectedId,
    select: setSelectedId,
    messages: current,
    hasMore: selectedId ? (hasMore[selectedId] ?? false) : false,
    loadOlder,
    loadingOlder,
    online,
    typing,
    connected,
    send,
    retry,
    discard,
    notifyTyping,
    updateConversation,
    reloadConversations: loadConversations,
  };
}

export type ChatState = ReturnType<typeof useChat>;
