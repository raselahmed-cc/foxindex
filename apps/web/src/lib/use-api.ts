'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiClient } from './api-client';

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Minimal GET hook: fetches on mount and whenever `path` changes, ignores
 * stale responses, and exposes `reload` plus `setData` for optimistic updates.
 * Pass `null` to skip fetching.
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (path === null) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await apiClient.get<T>(path);
      if (id === requestId.current) {
        setDataState(result);
        setError(null);
      }
    } catch (e) {
      if (id === requestId.current) setError(e instanceof ApiError ? e : new ApiError('NETWORK_ERROR', 'Network error'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater));
  }, []);

  return { data, error, loading, reload: load, setData };
}

/** Extracts a user-facing message from anything thrown by apiClient. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) {
    const details = error.details as { path: string; message: string }[] | { reason?: string } | undefined;
    if (Array.isArray(details) && details[0]) return `${details[0].path ? `${details[0].path}: ` : ''}${details[0].message}`;
    return error.message || fallback;
  }
  return fallback;
}
