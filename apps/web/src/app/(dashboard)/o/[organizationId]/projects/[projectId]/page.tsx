'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import type { Domain, UrlSubmission } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';

export default function ProjectPage({
  params,
}: {
  params: Promise<{ organizationId: string; projectId: string }>;
}) {
  const { organizationId, projectId } = use(params);
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [submissions, setSubmissions] = useState<UrlSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Domain[]>(`/projects/${projectId}/domains`)
      .then(setDomains)
      .catch((e: Error) => setError(e.message));
    apiClient
      .get<UrlSubmission[]>(`/projects/${projectId}/submissions`)
      .then(setSubmissions)
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  return (
    <div className="flex flex-col gap-10">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Domains</h1>
          <Button asChild variant="outline" size="sm">
            <Link href={`/o/${organizationId}/projects/${projectId}/domains/new`}>Add domain</Link>
          </Button>
        </div>
        {domains === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {domains?.length === 0 && (
          <p className="text-sm text-muted-foreground">No domains yet — add one to start submitting URLs.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {domains?.map((domain) => (
            <Link key={domain.id} href={`/o/${organizationId}/projects/${projectId}/domains/${domain.id}`}>
              <Card className="transition-colors hover:bg-muted">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{domain.hostname}</CardTitle>
                  <StatusBadge status={domain.verificationStatus} />
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Submissions</h1>
          <Button asChild size="sm">
            <Link href={`/o/${organizationId}/projects/${projectId}/submit`}>Submit URLs</Link>
          </Button>
        </div>
        {submissions?.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {submissions?.map((submission) => (
            <Link
              key={submission.id}
              href={`/o/${organizationId}/projects/${projectId}/submissions/${submission.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted"
            >
              <span className="truncate">{submission.url?.normalizedUrl ?? submission.urlId}</span>
              <StatusBadge status={submission.state} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
