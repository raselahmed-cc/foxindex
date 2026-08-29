import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-xl font-semibold">FoxIndex</div>
        {children}
      </div>
    </div>
  );
}
