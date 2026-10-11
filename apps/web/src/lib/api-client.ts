import { getAccessToken } from './auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** Thrown by every apiClient method on a non-success response — carries the server's own error taxonomy (constitution §36). */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorBody;
}

/**
 * The dashboard never talks to Postgres directly — every request goes through
 * this client to apps/api (constitution §7). `credentials: 'include'` sends
 * the httpOnly refresh-token cookie (only actually read by /auth/refresh and
 * /auth/logout, per its cookie path); the access token, when present, is
 * attached as a Bearer header from the in-memory auth-store.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = getAccessToken();
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  const body = (await response.json().catch(() => undefined)) as ApiEnvelope<T> | undefined;

  if (!body || !body.success) {
    throw new ApiError(
      body?.error?.code ?? 'NETWORK_ERROR',
      body?.error?.message ?? `Request failed with status ${response.status}`,
      body?.error?.details,
    );
  }

  return body.data as T;
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, data?: unknown, headers?: Record<string, string>): Promise<T> =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined, headers }),
  patch: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};

/** Authenticated file download (e.g. CSV export) — saves the response body under `filename`. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const accessToken = getAccessToken();
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as ApiEnvelope<unknown> | undefined;
    throw new ApiError(body?.error?.code ?? 'NETWORK_ERROR', body?.error?.message ?? `Download failed (${response.status})`);
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
