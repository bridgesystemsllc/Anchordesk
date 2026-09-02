import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphError, graphRequest } from './client';

vi.mock('./auth', () => ({
  getAccessToken: vi.fn(async () => 'mock-token'),
}));

vi.mock('./backoff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./backoff')>();
  return {
    ...actual,
    sleep: vi.fn(async () => {}),
  };
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : status === 429 ? 'Too Many Requests' : 'Error',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('graphRequest retry behavior', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('retries 429 with Retry-After: 0 then succeeds on second call', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'TooManyRequests' } }, 429, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(jsonResponse({ value: 'success' }));

    const result = await graphRequest('/test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ value: 'success' });
  });

  it('exhausts all 5 attempts on repeated 429s', async () => {
    for (let i = 0; i < 5; i++) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'TooManyRequests' } }, 429, { 'Retry-After': '0' }));
    }

    await expect(graphRequest('/test')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('does not retry 403 - fails immediately', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'Forbidden', message: 'Access denied' } }, 403));

    await expect(graphRequest('/test')).rejects.toThrow(GraphError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 500 then succeeds on second call', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'InternalServerError' } }, 500))
      .mockResolvedValueOnce(jsonResponse({ data: 'recovered' }));

    const result = await graphRequest('/test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: 'recovered' });
  });
});
