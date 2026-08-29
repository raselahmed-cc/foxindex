'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import type { Domain } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NewDomainPage({
  params,
}: {
  params: Promise<{ organizationId: string; projectId: string }>;
}) {
  const { organizationId, projectId } = use(params);
  const router = useRouter();
  const [hostname, setHostname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const domain = await apiClient.post<Domain>(`/projects/${projectId}/domains`, { hostname });
      router.push(`/o/${organizationId}/projects/${projectId}/domains/${domain.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add the domain');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Add a domain</CardTitle>
        <CardDescription>
          We&apos;ll generate an IndexNow key for this domain. You&apos;ll host it as a text file to prove
          ownership and authorize submissions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hostname">Hostname</Label>
            <Input
              id="hostname"
              required
              placeholder="example.com"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Adding…' : 'Add domain'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
