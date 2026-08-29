'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import type { Organization } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardHomePage() {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Organization[]>('/organizations')
      .then(setOrganizations)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <Button asChild>
          <Link href="/organizations/new">New organization</Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {organizations === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {organizations?.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No organizations yet</CardTitle>
            <CardDescription>Create one to add your first project and domain.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {organizations?.map((org) => (
          <Link key={org.id} href={`/o/${org.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle>{org.name}</CardTitle>
                <CardDescription>{org.slug}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
