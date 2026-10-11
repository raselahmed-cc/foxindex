'use client';

import { Suspense } from 'react';
import { UsersView } from '@/components/admin/users-view';

export default function UsersPage() {
  return (
    <Suspense>
      <UsersView mode="all" />
    </Suspense>
  );
}
