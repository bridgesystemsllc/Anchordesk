// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiQueueRow } from '@/data/fromApi';

/**
 * Drives the whole live-mode chain in one go — fetch → adapter → hook →
 * component. Type-checking proves the shapes line up; this proves the queue
 * actually renders a row from a real API payload without throwing.
 */

const API = 'http://anchor.test';

function apiRow(overrides: Partial<ApiQueueRow> = {}): ApiQueueRow {
  return {
    id: 'b3085b5b-0bf4-4e73-93b5-331a65ff4392',
    number: 1001,
    brand: 'DB',
    subject: 'Cover Care concealer arrived cracked',
    status: 'pending',
    priority: 2,
    channel: 'email',
    intent: 'damage',
    sentiment: 0,
    orderNumber: 'DB-77219',
    mailbox: 'support@dermablend.com',
    assigneeId: null,
    unread: false,
    slaDueAt: new Date(Date.now() + 90 * 60_000).toISOString(),
    lastMessageAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 120 * 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
    preview: 'The compact was shattered inside the box.',
    messageCount: 2,
    aiDraftReady: false,
    customerId: '9e60a813-5f9a-463e-8738-2d103dc5a0d4',
    customerName: 'Priscilla Nwosu',
    customerEmail: 'p.nwosu@icloud.com',
    customerVip: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderQueue() {
  const { Queue } = await import('@/screens/Queue');
  return render(
    <MemoryRouter>
      <Queue />
    </MemoryRouter>,
  );
}

describe('Queue in live mode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', API);
    vi.stubEnv('VITE_API_TOKEN', 'test-token');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('renders a ticket returned by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ tickets: [apiRow()], nextBefore: null })),
    );

    await renderQueue();

    await waitFor(() => expect(screen.getByText('Cover Care concealer arrived cracked')).toBeTruthy());
    expect(screen.getByText('Priscilla Nwosu')).toBeTruthy();
    expect(screen.getByText('1001')).toBeTruthy();
    expect(screen.getByText('The compact was shattered inside the box.')).toBeTruthy();
    // No order snapshot yet, so the row falls back to the extracted number.
    expect(screen.getByText('DB-77219')).toBeTruthy();
  });

  it('sends the filters to the server rather than filtering after the fact', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ tickets: [apiRow()], nextBefore: null }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderQueue();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain(`${API}/api/tickets`);
    expect(url).toContain('status=open_all');
  });

  it('sends the bearer token', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ tickets: [], nextBefore: null }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderQueue();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer test-token');
  });

  it('shows an empty state rather than a blank page when nothing matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ tickets: [], nextBefore: null })));

    await renderQueue();

    await waitFor(() => expect(screen.getByText('Nothing in this view')).toBeTruthy());
  });

  it('surfaces a server error with a retry instead of an empty queue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'internal_error' }, 500)),
    );

    await renderQueue();

    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy());
    expect(screen.getByText(/Server error/)).toBeTruthy();
  });

  it('explains an unreachable server in plain language', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await renderQueue();

    await waitFor(() =>
      expect(screen.getByText(/Could not reach the Anchor Desk server/)).toBeTruthy(),
    );
  });

  it('names the auth problem specifically on a 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401)));

    await renderQueue();

    await waitFor(() => expect(screen.getByText(/VITE_API_TOKEN/)).toBeTruthy());
  });

  it('survives a row with nulls where the demo data always has values', async () => {
    // A ticket ingested before a customer record existed, with no order and no
    // SLA. Every one of these blanked the row in an earlier draft.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          tickets: [
            apiRow({
              subject: null,
              intent: null,
              orderNumber: null,
              slaDueAt: null,
              preview: null,
              messageCount: null,
              customerId: null,
              customerName: null,
              customerEmail: null,
              customerVip: null,
              tags: null,
            }),
          ],
          nextBefore: null,
        }),
      ),
    );

    await renderQueue();

    await waitFor(() => expect(screen.getByText('(no subject)')).toBeTruthy());
    // A null intent renders as the Other chip on the row itself — "Other" also
    // appears in the intent filter, so match the chip specifically.
    expect(
      screen.getAllByText('Other').some((el) => el.className.includes('chip')),
    ).toBe(true);
    // Customer, order and assignee are each absent and each render a dash
    // rather than collapsing the row.
    expect(screen.getAllByText('—')).toHaveLength(3);
  });
});

describe('Queue in demo mode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', '');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('renders the bundled dataset without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await renderQueue();

    await waitFor(() =>
      expect(screen.getByText('Order still says in transit after 9 days')).toBeTruthy(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
