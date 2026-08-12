import { useCallback, useEffect, useRef, useState } from 'react';

export interface Resource<T> {
  data: T | undefined;
  error: unknown;
  /** True only on the first load — a background refresh must not blank the screen. */
  loading: boolean;
  refreshing: boolean;
  refetch: () => void;
}

interface Options {
  /** Poll interval in ms. Polling pauses while the tab is hidden. */
  pollMs?: number;
  enabled?: boolean;
}

/**
 * Fetches once, refetches on demand, and optionally polls.
 *
 * Two things it gets right that a naive useEffect does not: an in-flight request
 * is aborted when the key changes or the component unmounts, so a slow response
 * can never overwrite newer data; and a poll while the tab is hidden is skipped,
 * because a background queue nobody is looking at should not be hammering the
 * server or Graph's throttling budget.
 */
export function useResource<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  { pollMs, enabled = true }: Options = {},
): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);

  // Kept in a ref so changing the fetcher identity doesn't retrigger the effect.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const hasLoaded = useRef(false);

  // Reset during render rather than in an effect. Effects for the fetch run
  // before any reset effect would, so a key change would otherwise start the
  // new request while `hasLoaded` still said true — the skeleton would be
  // skipped and the screen would flash empty instead.
  const prevKey = useRef(key);
  if (prevKey.current !== key) {
    prevKey.current = key;
    hasLoaded.current = false;
    setData(undefined);
    setError(undefined);
    setLoading(enabled);
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const run = async (background: boolean) => {
      if (background) setRefreshing(true);
      else if (!hasLoaded.current) setLoading(true);

      try {
        const result = await fetcherRef.current(controller.signal);
        if (cancelled) return;
        setData(result);
        setError(undefined);
        hasLoaded.current = true;
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        // Keep the last good data on a failed refresh; surface the error
        // alongside it rather than replacing the screen with an error state.
        setError(e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void run(false);

    let timer: number | undefined;
    if (pollMs && pollMs > 0) {
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void run(true);
      }, pollMs);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) window.clearInterval(timer);
    };
  }, [key, nonce, pollMs, enabled]);

  return { data, error, loading, refreshing, refetch };
}
