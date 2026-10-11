'use client';

import { io, type Socket } from 'socket.io-client';
import { apiClient } from './api-client';
import { getAccessToken, setAccessToken } from './auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;
let holders = 0;

/**
 * One socket for the whole app, shared by the realtime provider, the chat
 * popup and the chat page. Reference-counted: it connects on the first
 * acquire and disconnects when the last holder releases it. `auth` is a
 * callback so every (re)connect uses the freshest access token; if the token
 * has expired, we refresh it and reconnect once.
 */
function create(): Socket {
  const s = io(`${API_URL}/chat`, {
    autoConnect: false,
    auth: (cb: (data: { token: string | null }) => void) => cb({ token: getAccessToken() }),
    reconnectionDelayMax: 10_000,
  });

  let refreshing = false;
  const refreshAndReconnect = () => {
    if (refreshing) return;
    refreshing = true;
    apiClient
      .post<{ accessToken: string }>('/auth/refresh')
      .then((r) => {
        setAccessToken(r.accessToken);
        if (holders > 0) s.connect();
      })
      .catch(() => undefined)
      .finally(() => {
        refreshing = false;
      });
  };

  s.on('auth:error', refreshAndReconnect);
  // Server-initiated disconnect (e.g. token expired at handshake) is not auto-retried by socket.io.
  s.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' && holders > 0) refreshAndReconnect();
  });
  return s;
}

export function acquireChatSocket(): Socket {
  socket ??= create();
  holders += 1;
  if (!socket.connected && !socket.active) socket.connect();
  return socket;
}

export function releaseChatSocket(): void {
  holders = Math.max(0, holders - 1);
  if (holders === 0) socket?.disconnect();
}

/** For sign-out: drop the connection regardless of holders. */
export function resetChatSocket(): void {
  holders = 0;
  socket?.disconnect();
  socket = null;
}
