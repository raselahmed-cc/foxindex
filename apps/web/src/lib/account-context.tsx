'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiClient } from './api-client';
import type { CreditSummary, Profile } from './api-types';

interface AccountState {
  profile: Profile | null;
  credits: CreditSummary | null;
  refreshProfile: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  setProfile: (profile: Profile) => void;
}

const AccountContext = createContext<AccountState>({
  profile: null,
  credits: null,
  refreshProfile: async () => undefined,
  refreshCredits: async () => undefined,
  setProfile: () => undefined,
});

/** Profile + balance are needed by the shell (sidebar card, manager name) and several pages — fetched once here. */
export function AccountProvider({ children, isClient }: { children: ReactNode; isClient: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [credits, setCredits] = useState<CreditSummary | null>(null);

  const refreshProfile = useCallback(async () => {
    setProfile(await apiClient.get<Profile>('/me/profile').catch(() => null));
  }, []);

  const refreshCredits = useCallback(async () => {
    if (!isClient) return;
    setCredits(await apiClient.get<CreditSummary>('/credits/summary').catch(() => null));
  }, [isClient]);

  useEffect(() => {
    void refreshProfile();
    void refreshCredits();
  }, [refreshProfile, refreshCredits]);

  return (
    <AccountContext.Provider value={{ profile, credits, refreshProfile, refreshCredits, setProfile }}>{children}</AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
