'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';
import type { Domain, DomainVerificationAttempt } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';

export default function DomainPage({
  params,
}: {
  params: Promise<{ organizationId: string; projectId: string; domainId: string }>;
}) {
  const { projectId, domainId } = use(params);
  const [domain, setDomain] = useState<Domain | null>(null);
  const [attempts, setAttempts] = useState<DomainVerificationAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(() => {
    apiClient
      .get<Domain>(`/projects/${projectId}/domains/${domainId}`)
      .then(setDomain)
      .catch((e: Error) => setError(e.message));
    apiClient
      .get<DomainVerificationAttempt[]>(`/projects/${projectId}/domains/${domainId}/verifications`)
      .then(setAttempts)
      .catch(() => undefined);
  }, [projectId, domainId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleVerify() {
    setError(null);
    setVerifying(true);
    try {
      await apiClient.post(`/projects/${projectId}/domains/${domainId}/verify?recheck=true`);
      // Verification runs asynchronously on a worker — poll once after a beat
      // rather than assuming it's already done when this call returns.
      setTimeout(load, 3000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not request verification');
    } finally {
      setVerifying(false);
    }
  }

  if (!domain) {
    return <p className="text-sm text-muted-foreground">{error ?? 'Loading…'}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{domain.hostname}</h1>
        <StatusBadge status={domain.verificationStatus} />
      </div>

      {domain.verificationStatus !== 'VERIFIED' && (
        <Card>
          <CardHeader>
            <CardTitle>Verify ownership</CardTitle>
            <CardDescription>
              Host this file at the exact URL below, then verify. The same key authorizes future IndexNow
              submissions for this domain — verifying and authorizing are the same step.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="rounded-md bg-muted p-3 font-mono text-sm">{domain.keyFileUrl}</div>
            <p className="text-sm text-muted-foreground">File contents (exactly, no extra whitespace):</p>
            <div className="rounded-md bg-muted p-3 font-mono text-sm break-all">{domain.indexnowKey}</div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleVerify} disabled={verifying} className="self-start">
              {verifying ? 'Requesting…' : 'Verify now'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Verification history</CardTitle>
        </CardHeader>
        <CardContent>
          {attempts?.length === 0 && <p className="text-sm text-muted-foreground">No attempts yet.</p>}
          <div className="flex flex-col divide-y divide-border">
            {attempts?.map((attempt) => (
              <div key={attempt.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex flex-col">
                  <span>{new Date(attempt.attemptedAt).toLocaleString()}</span>
                  {attempt.failureReason && (
                    <span className="text-muted-foreground">{attempt.failureReason}</span>
                  )}
                </div>
                <StatusBadge status={attempt.status} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
