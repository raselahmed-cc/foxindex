'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import type { Domain, SubmitUrlsResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SubmitUrlsPage({
  params,
}: {
  params: Promise<{ organizationId: string; projectId: string }>;
}) {
  const { organizationId, projectId } = use(params);
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [domainId, setDomainId] = useState('');
  const [urlsText, setUrlsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubmitUrlsResult | null>(null);

  useEffect(() => {
    apiClient.get<Domain[]>(`/projects/${projectId}/domains`).then((all) => {
      setDomains(all);
      // Prefer a verified domain as the default selection, but don't require
      // one to exist — IndexNow itself is the real authorization check, not
      // FoxIndex's own verification status (see docs/adr/0010). Submitting
      // for an unverified domain is allowed; it may still fail once IndexNow
      // looks for the key file and doesn't find it.
      const preferred = all.find((d) => d.verificationStatus === 'VERIFIED') ?? all[0];
      if (preferred) setDomainId(preferred.id);
    });
  }, [projectId]);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const contents = String(reader.result ?? '');
      const urls = contents
        .split(/[\n,]+/)
        .map((line) => line.trim())
        .filter(Boolean);
      setUrlsText((existing) => (existing ? `${existing}\n${urls.join('\n')}` : urls.join('\n')));
    };
    reader.readAsText(file);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    const urls = urlsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      setError('Enter at least one URL');
      return;
    }
    setLoading(true);
    try {
      const submitResult = await apiClient.post<SubmitUrlsResult>(`/projects/${projectId}/submissions`, {
        domainId,
        urls,
      });
      setResult(submitResult);
      setUrlsText('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit these URLs');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Submit URLs</CardTitle>
        <CardDescription>
          One URL per line, up to 20 — paste them in or upload a .csv/.txt file. A full batch can take up to
          a minute or two to process. Each is pushed to IndexNow (Bing, Yandex, Naver, Seznam, Yep) and costs
          one credit — this confirms the push was accepted, not that any engine has indexed the page yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="domain">Domain</Label>
            <select
              id="domain"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              required
            >
              {domains?.length === 0 && <option value="">No domains yet — add one first</option>}
              {domains?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.hostname}
                  {d.verificationStatus !== 'VERIFIED' ? ' (unverified)' : ''}
                </option>
              ))}
            </select>
            {domains?.find((d) => d.id === domainId)?.verificationStatus !== 'VERIFIED' && domainId && (
              <p className="text-sm text-muted-foreground">
                This domain isn&apos;t verified yet. Submissions are still sent to IndexNow, but it will reject
                them if the key file isn&apos;t actually hosted at this domain.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="urls">URLs</Label>
              <label className="cursor-pointer text-xs text-muted-foreground underline">
                Upload .csv/.txt
                <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFile} className="hidden" />
              </label>
            </div>
            <textarea
              id="urls"
              required
              rows={8}
              className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
              placeholder={'https://example.com/page-1\nhttps://example.com/page-2'}
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading || !domainId}>
            {loading ? 'Submitting…' : 'Submit'}
          </Button>
        </form>

        {result && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
            <p>
              {result.submissions.length} accepted, {result.rejected.length} rejected.
            </p>
            {result.rejected.map((r) => (
              <p key={r.url} className="text-destructive">
                {r.url}: {r.message}
              </p>
            ))}
            {result.submissions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => router.push(`/o/${organizationId}/projects/${projectId}`)}
              >
                View submissions
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
