/**
 * Thin client for the Anchor Desk server.
 *
 * `VITE_API_URL` is the switch between live and demo data. With it unset the
 * app runs entirely on the bundled dataset, so the UI stays reviewable without
 * a backend, a database, or admin consent.
 *
 * `VITE_API_TOKEN` matches the server's API_AUTH_TOKEN and exists only until
 * Entra SSO lands. It ships in the bundle, so it is a development convenience
 * and never a production secret — see the note in README.
 */
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined;

export const isLive = Boolean(BASE_URL);

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** A 401 means the dev token is wrong or missing — a config problem, not an outage. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/**
 * `allowStatus` lets a caller accept a non-2xx that still carries a useful body.
 * The ingest health endpoint answers 503 when a mailbox is unhealthy, and that
 * response is exactly the one worth reading.
 */
export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
  allowStatus: number[] = [],
): Promise<T> {
  if (!BASE_URL) throw new ApiError('VITE_API_URL is not configured', 0);

  // Compose the caller's signal with our own timeout so a hung request can't
  // leave the queue spinning forever.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      signal: composed,
      headers: {
        Accept: 'application/json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    });
  } catch (e) {
    // An aborted request is the caller navigating away, not a failure to report.
    if (signal?.aborted) throw e;
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new ApiError('The server took too long to respond', 0);
    }
    throw new ApiError('Could not reach the Anchor Desk server', 0);
  }

  if (!res.ok && !allowStatus.includes(res.status)) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as T;
}

export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.isUnauthorized) return 'Not authorized. Check VITE_API_TOKEN matches the server.';
    if (e.status === 0) return e.message;
    return `Server error: ${e.message}`;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
