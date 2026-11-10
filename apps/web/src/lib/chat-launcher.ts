'use client';

/**
 * Clients chat with their manager in the bottom-right pop-up on desktop; on
 * phones the full /chat page fits better. Anything that would open /chat calls
 * openClientChat() first, and only navigates when the pop-up can't take it.
 */
const EVENT = 'fx:open-chat';
let widgetMounted = false;

export const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

/** Called by the pop-up while it's on screen. */
export function registerChatWidget(onOpen: () => void): () => void {
  widgetMounted = true;
  window.addEventListener(EVENT, onOpen);
  return () => {
    widgetMounted = false;
    window.removeEventListener(EVENT, onOpen);
  };
}

/** True when the pop-up handled it — the caller should not navigate. */
export function openClientChat(href = '/chat'): boolean {
  if (href !== '/chat' || !widgetMounted || !isDesktop()) return false;
  window.dispatchEvent(new Event(EVENT));
  return true;
}
