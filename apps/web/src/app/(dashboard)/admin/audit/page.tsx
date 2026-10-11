'use client';

import { useEffect, useState } from 'react';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, EmptyState, ErrorBanner, Select, Skeleton, Table } from '@/components/dash/ui';
import { apiClient } from '@/lib/api-client';
import type { AuditEvent } from '@/lib/api-types';
import { fmtDateTime } from '@/lib/format';

const PAGE = 50;
const PREFIXES = ['payment', 'credits', 'user', 'staff', 'api_key', 'provider', 'gsa', 'pack', 'payment_method', 'password', 'profile'];

export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(before?: string) {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(PAGE) });
      if (action) p.set('action', action);
      if (before) p.set('before', before);
      const page = await apiClient.get<AuditEvent[]>(`/admin/audit-logs?${p}`);
      setRows((prev) => (before ? [...prev, ...page] : page));
      setDone(page.length < PAGE);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [action]);

  return (
    <>
      <DashboardTopbar title="Audit log" subtitle="Every credit, payment, role and configuration change — append-only" search={false} />
      <Card>
        <div className="flex items-center gap-2.5 border-b border-auth-line px-4.5 py-3">
          <Select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className="w-auto py-1.5 text-[12.5px]">
            <option value="">All actions</option>
            {PREFIXES.map((p) => <option key={p} value={p}>{p}.*</option>)}
          </Select>
        </div>
        {error && <div className="p-4"><ErrorBanner message="Could not load the audit log." onRetry={() => void load()} /></div>}
        {!error && rows.length === 0 && !loading ? (
          <EmptyState title="No events">Actions by staff and clients show up here as they happen.</EmptyState>
        ) : (
          <Table head={['When', 'Action', 'Actor', 'Target', 'Details']}>
            {rows.map((e) => (
              <tr key={e.id} className="cursor-pointer" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                <td className="font-mono text-xs whitespace-nowrap text-auth-text3">{fmtDateTime(e.createdAt)}</td>
                <td className="font-mono text-[12.5px] whitespace-nowrap">{e.action}</td>
                <td className="whitespace-nowrap">{e.actorName ?? <span className="text-auth-text3">system</span>}</td>
                <td className="font-mono text-xs whitespace-nowrap text-auth-text3">{e.targetType}{e.targetId ? ` · ${e.targetId.slice(0, 8)}` : ''}</td>
                <td className="max-w-[420px] text-xs text-auth-text3">
                  {e.metadata ? (
                    expanded === e.id ? (
                      <pre className="font-mono whitespace-pre-wrap text-auth-text2">{JSON.stringify(e.metadata, null, 2)}</pre>
                    ) : (
                      <span className="block truncate font-mono">{JSON.stringify(e.metadata)}</span>
                    )
                  ) : '—'}
                </td>
              </tr>
            ))}
            {loading && rows.length === 0 && [0, 1, 2, 3].map((i) => <tr key={i}><td colSpan={5}><Skeleton className="h-5" /></td></tr>)}
          </Table>
        )}
        <div className="flex items-center justify-between border-t border-auth-line px-4.5 py-3 text-[12.5px] text-auth-text3">
          <span>{rows.length} events loaded · click a row for full details</span>
          {!done && rows.length > 0 && <Button variant="link" disabled={loading} onClick={() => void load(rows[rows.length - 1].createdAt)}>Load older</Button>}
        </div>
      </Card>
    </>
  );
}
