'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import type { SubmitUrlsResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SubmitUrlsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();
  const [urlsText, setUrlsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubmitUrlsResult | null>(null);

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
      // Every URL submits under this project's own IndexNow key, regardless
      // of hostname (docs/adr/0013) — IndexNow itself rejects anything the
      // key isn't actually hosted at.
      const submitResult = await apiClient.post<SubmitUrlsResult>(`/projects/${projectId}/submissions`, {
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
          One URL per line, up to 20 (paste them in or upload a .csv/.txt file). Every URL submits under this
          project&apos;s own IndexNow key — IndexNow will reject a URL if its host doesn&apos;t actually serve
          that key, so this works best when every URL you submit here is on one real website. A full batch
          can take up to a minute or two to process. Each accepted URL is pushed to IndexNow (Bing, Yandex,
          Naver, Seznam, Yep) and costs one credit — this confirms the push was accepted, not that any engine
          has indexed the page yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          <Button type="submit" disabled={loading}>
            {loading ? 'Submitting…' : 'Submit'}
          </Button>
        </form>

        {result && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
            <p>
              {result.submissions.length} accepted, {result.rejected.length} rejected.
            </p>
            {result.submissions.map((s) => (
              <p key={s.urlId} className="text-muted-foreground">
                {s.normalizedUrl} <span className="text-xs">({s.hostname})</span>
              </p>
            ))}
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
                onClick={() => router.push(`/projects/${projectId}`)}
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
