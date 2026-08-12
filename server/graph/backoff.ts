export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 60_000;

/** Graph throttles with 429 and asks for 503/504 retries on transient faults. */
export const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Parses a Retry-After header. Graph sends delta-seconds; the HTTP spec also
 * permits an HTTP-date, and Graph has been observed to send one. Returns
 * milliseconds, or null when the header is absent or unparseable.
 */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;

  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed) * 1000;
    return Number.isFinite(ms) ? Math.min(ms, MAX_DELAY_MS) : null;
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  // A date in the past means retry immediately, not a negative wait.
  return Math.min(Math.max(0, date - now), MAX_DELAY_MS);
}

/**
 * Delay before the next attempt. `attempt` is 1-based: 1 is the wait after the
 * first failure. Retry-After always wins — ignoring it is how an app gets its
 * throttling window extended. Otherwise exponential with full jitter, so a
 * fleet of workers doesn't retry in lockstep.
 */
export function computeDelay(
  attempt: number,
  retryAfterHeader?: string | null,
  random: () => number = Math.random,
  now = Date.now(),
): number {
  const explicit = parseRetryAfter(retryAfterHeader, now);
  if (explicit !== null) return explicit;

  const ceiling = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
