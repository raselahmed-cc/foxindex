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
 * the Better Auth session cookie; the API's CORS config explicitly allows
 * credentialed requests from CORS_ORIGIN.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
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
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};
