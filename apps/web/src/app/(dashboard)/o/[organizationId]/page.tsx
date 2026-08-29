'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import type { Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function OrganizationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = use(params);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Project[]>(`/organizations/${organizationId}/projects`)
      .then(setProjects)
      .catch((e: Error) => setError(e.message));
  }, [organizationId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button asChild>
          <Link href={`/o/${organizationId}/projects/new`}>New project</Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {projects === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {projects?.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {projects?.map((project) => (
          <Link key={project.id} href={`/o/${organizationId}/projects/${project.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>{project.slug}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
