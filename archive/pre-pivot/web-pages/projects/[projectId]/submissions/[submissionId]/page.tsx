'use client';

import { use, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { SubmissionAttempt, UrlSubmission } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';

type SubmissionDetail = UrlSubmission & { attempts: SubmissionAttempt[] };

export default function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; submissionId: string }>;
}) {
  const { projectId, submissionId } = use(params);
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<SubmissionDetail>(`/projects/${projectId}/submissions/${submissionId}`)
      .then(setSubmission)
      .catch((e: Error) => setError(e.message));
  }, [projectId, submissionId]);

  if (!submission) {
    return <p className="text-sm text-muted-foreground">{error ?? 'Loading…'}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="truncate text-2xl font-semibold">{submission.url?.normalizedUrl}</h1>
        <StatusBadge status={submission.state} />
      </div>

      {submission.failureDetail && (
        <p className="text-sm text-destructive">
          {submission.failureReason}: {submission.failureDetail}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Attempt history</CardTitle>
        </CardHeader>
        <CardContent>
          {submission.attempts.length === 0 && (
            <p className="text-sm text-muted-foreground">Not yet picked up by a worker.</p>
          )}
          <div className="flex flex-col divide-y divide-border">
            {submission.attempts.map((attempt) => (
              <div key={attempt.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex flex-col">
                  <span>
                    Attempt {attempt.attemptNumber} · {attempt.provider} ·{' '}
                    {new Date(attempt.attemptedAt).toLocaleString()}
                  </span>
                  {attempt.errorMessage && <span className="text-muted-foreground">{attempt.errorMessage}</span>}
                </div>
                <StatusBadge status={attempt.succeeded ? 'SUBMITTED' : 'FAILED'} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
