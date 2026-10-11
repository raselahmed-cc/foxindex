'use client';

import { Suspense } from 'react';
import { UsersView } from '@/components/admin/users-view';

export default function ApprovalsPage() {
  return (
    <Suspense>
      <UsersView mode="approvals" />
    </Suspense>
  );
}
