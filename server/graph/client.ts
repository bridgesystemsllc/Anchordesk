import { getAccessToken } from './auth';
import { MAX_ATTEMPTS, RETRYABLE_STATUS, computeDelay, sleep } from './backoff';
import { errFields, log } from '../log';

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const REQUEST_TIMEOUT_MS = 30_000;

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly requestId: string | undefined,
    readonly url: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** 401/403 mean the app registration is wrong — retrying will not fix it. */
  get isAuthz(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Absolute URL (nextLink / deltaLink) or a path relative to GRAPH_BASE. */
  absolute?: boolean;
  headers?: Record<string, string>;
}

async function readError(res: Response, url: string): Promise<GraphError> {
  let code: string | undefined;
  let message = `${res.status} ${res.statusText}`;
  try {
    const payload = (await res.json()) as { error?: { code?: string; message?: string } };
    if (payload?.error) {
      code = payload.error.code;
      if (payload.error.message) message = payload.error.message;
    }
  } catch {
    // Non-JSON error body — the status line is all we get.
  }
  return new GraphError(message, res.status, code, res.headers.get('request-id') ?? undefined, url);
}

/**
 * Single Graph call with throttling-aware retry.
 *
 * Retries on 429/5xx honouring Retry-After, and on network faults with jittered
 * exponential backoff. Never retries a 4xx that is not 429 — a 403 means the
 * permission is missing, and hammering it just burns the throttling budget.
 */
export async function graphRequest<T>(pathOrUrl: string, opts: RequestOptions = {}): Promise<T> {
  const url = opts.absolute ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  const method = opts.method ?? 'GET';

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      const token = await getAccessToken();
      const res = await fetch(url, {
        method,
        signal: timeout,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...opts.headers,
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      const error = await readError(res, url);

      if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) throw error;

      const delay = computeDelay(attempt, res.headers.get('retry-after'));
      log.warn('graph request throttled, backing off', {
        url,
        status: res.status,
        code: error.code,
        attempt,
        delayMs: delay,
      });
      await sleep(delay);
      lastError = error;
      continue;
    } catch (e) {
      // A GraphError we already decided not to retry propagates immediately.
      if (e instanceof GraphError && (!RETRYABLE_STATUS.has(e.status) || attempt === MAX_ATTEMPTS)) {
        throw e;
      }
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Graph request failed after ${MAX_ATTEMPTS} attempts: ${method} ${url}`, {
          cause: e,
        });
      }
      lastError = e;
      const delay = computeDelay(attempt);
      log.warn('graph request failed, retrying', { url, attempt, delayMs: delay, ...errFields(e) });
      await sleep(delay);
    }
  }

  throw new Error(`Graph request exhausted retries: ${method} ${url}`, { cause: lastError });
}

/**
 * Graph call returning raw text content. Used for SharePoint document content
 * that isn't JSON (e.g. plain text preview).
 */
export async function graphRequestText(pathOrUrl: string, opts: Omit<RequestOptions, 'body'> = {}): Promise<string> {
  const url = opts.absolute ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  const method = opts.method ?? 'GET';

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      const token = await getAccessToken();
      const res = await fetch(url, {
        method,
        signal: timeout,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/plain',
          ...opts.headers,
        },
      });

      if (res.ok) {
        return await res.text();
      }

      const error = await readError(res, url);

      if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) throw error;

      const delay = computeDelay(attempt, res.headers.get('retry-after'));
      log.warn('graph text request throttled, backing off', {
        url,
        status: res.status,
        code: error.code,
        attempt,
        delayMs: delay,
      });
      await sleep(delay);
      lastError = error;
      continue;
    } catch (e) {
      if (e instanceof GraphError && (!RETRYABLE_STATUS.has(e.status) || attempt === MAX_ATTEMPTS)) {
        throw e;
      }
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Graph text request failed after ${MAX_ATTEMPTS} attempts: ${method} ${url}`, {
          cause: e,
        });
      }
      lastError = e;
      const delay = computeDelay(attempt);
      log.warn('graph text request failed, retrying', { url, attempt, delayMs: delay, ...errFields(e) });
      await sleep(delay);
    }
  }

  throw new Error(`Graph text request exhausted retries: ${method} ${url}`, { cause: lastError });
}

/**
 * Graph call returning raw bytes. Used for downloading SharePoint document
 * content (PDF, DOCX, etc).
 */
export async function graphRequestBytes(pathOrUrl: string, opts: Omit<RequestOptions, 'body'> = {}): Promise<Buffer> {
  const url = opts.absolute ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  const method = opts.method ?? 'GET';

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      const token = await getAccessToken();
      const res = await fetch(url, {
        method,
        signal: timeout,
        headers: {
          Authorization: `Bearer ${token}`,
          ...opts.headers,
        },
      });

      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      const error = await readError(res, url);

      if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) throw error;

      const delay = computeDelay(attempt, res.headers.get('retry-after'));
      log.warn('graph bytes request throttled, backing off', {
        url,
        status: res.status,
        code: error.code,
        attempt,
        delayMs: delay,
      });
      await sleep(delay);
      lastError = error;
      continue;
    } catch (e) {
      if (e instanceof GraphError && (!RETRYABLE_STATUS.has(e.status) || attempt === MAX_ATTEMPTS)) {
        throw e;
      }
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Graph bytes request failed after ${MAX_ATTEMPTS} attempts: ${method} ${url}`, {
          cause: e,
        });
      }
      lastError = e;
      const delay = computeDelay(attempt);
      log.warn('graph bytes request failed, retrying', { url, attempt, delayMs: delay, ...errFields(e) });
      await sleep(delay);
    }
  }

  throw new Error(`Graph bytes request exhausted retries: ${method} ${url}`, { cause: lastError });
}
