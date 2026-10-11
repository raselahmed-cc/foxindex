import type { Tone } from '@/components/dash/ui';

export type UrlStatus = 'indexed' | 'submitted' | 'queued' | 'failed';
export type EngineKey = 'google' | 'indexnow';

export interface EngineState {
  status: string;
  attempts: number;
  error: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface TrackedUrl {
  id: string;
  url: string;
  site: { id: string; domain: string };
  status: UrlStatus;
  createdAt: string;
  indexedAt: string | null;
  lastActivityAt: string;
  engines: Partial<Record<EngineKey, EngineState>>;
}

export interface UrlCounts {
  all: number;
  indexed: number;
  submitted: number;
  queued: number;
  failed: number;
}

export interface UrlPage {
  items: TrackedUrl[];
  hasMore: boolean;
  counts: UrlCounts;
}

export interface UrlDetail extends TrackedUrl {
  history: {
    id: string;
    engine: string;
    status: string;
    attempts: number;
    error: string | null;
    submittedAt: string | null;
    createdAt: string;
    creditCost: number;
    batch: { id: string; name: string | null } | null;
  }[];
}

export interface SiteRow {
  id: string;
  domain: string;
  createdAt: string;
  lastActivityAt: string | null;
  counts: { total: number; indexed: number; submitted: number; queued: number; failed: number };
}

export const URL_STATUS: Record<UrlStatus, { tone: Tone; label: string }> = {
  indexed: { tone: 'ok', label: 'Indexed' },
  submitted: { tone: 'info', label: 'Submitted' },
  queued: { tone: 'warn', label: 'Queued' },
  failed: { tone: 'bad', label: 'Failed' },
};

export const ENGINE_LABEL: Record<EngineKey, { short: string; name: string }> = {
  google: { short: 'G', name: 'Google' },
  indexnow: { short: 'B', name: 'Bing, Yandex & others' },
};

/** Tone for one engine's latest submission state. */
export function engineTone(status: string | undefined): Tone {
  if (!status) return 'muted';
  if (status === 'indexed' || status === 'submitted' || status === 'not_indexed') return status === 'indexed' ? 'ok' : 'info';
  if (status === 'queued' || status === 'retrying') return 'warn';
  return 'bad';
}

export const ENGINE_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  retrying: 'Retrying',
  submitted: 'Submitted',
  indexed: 'Indexed',
  not_indexed: 'Not indexed yet',
  failed: 'Failed',
  rejected: 'Rejected',
};

/** "techbazar.com.bd" + "/laptops/x" split for the mono URL cell. */
export function splitUrl(url: string): { host: string; rest: string } {
  try {
    const u = new URL(url);
    return { host: u.host, rest: `${u.pathname}${u.search}` || '/' };
  } catch {
    return { host: '', rest: url };
  }
}
