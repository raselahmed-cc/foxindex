import type { ReactNode } from 'react';

/**
 * Pass-through — each auth screen owns its full page layout now (login has
 * its own split design; signup and verify-email share its tokens). A
 * shared wrapper here would force every screen into the same shape, which
 * stopped being true once login got its own design.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
