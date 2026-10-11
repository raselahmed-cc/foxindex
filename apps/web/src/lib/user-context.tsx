'use client';

import { createContext, useContext } from 'react';
import type { CurrentUser } from './use-current-user';

export const UserContext = createContext<CurrentUser | null>(null);

/** The dashboard layout already resolved the session — pages read it from here instead of re-fetching /me. */
export function useUser(): CurrentUser {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error('useUser() called outside the (dashboard) layout');
  }
  return user;
}
