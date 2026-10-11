'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import type { Project, UrlSubmission } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [submissions, setSubmissions] = useState<UrlSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Project>(`/projects/${projectId}`)
      .then(setProject)
      .catch((e: Error) => setError(e.message));
    apiClient
      .get<UrlSubmission[]>(`/projects/${projectId}/submissions`)
      .then(setSubmissions)
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  return (
    <div className="flex flex-col gap-10">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {project && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">IndexNow key</CardTitle>
              <CardDescription>
                Host a file named <code>{project.indexnowKey}.txt</code> at the root of your website,
                containing exactly this key: <code>{project.indexnowKey}</code>. IndexNow checks for this
                file at the exact host each URL you submit belongs to (e.g.{' '}
                <code>https://yourdomain.com/{project.indexnowKey}.txt</code>) — this only works cleanly when
                every URL you submit under this project is on one real website.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Submissions</h1>
          <Button asChild size="sm">
            <Link href={`/projects/${projectId}/submit`}>Submit URLs</Link>
          </Button>
        </div>
        {submissions === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {submissions?.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {submissions?.map((submission) => (
            <Link
              key={submission.id}
              href={`/projects/${projectId}/submissions/${submission.id}`}
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
