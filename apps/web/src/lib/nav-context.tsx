'use client';

import { createContext, useContext } from 'react';
import type { NavGroup, NavItem } from './navigation';

export type Badges = Partial<Record<NonNullable<NavItem['badgeKey']>, number>>;

export interface NavState {
  groups: NavGroup[];
  badges: Badges;
  refreshBadges: () => void;
}

export const NavContext = createContext<NavState>({ groups: [], badges: {}, refreshBadges: () => undefined });

export function useNav() {
  return useContext(NavContext);
}
