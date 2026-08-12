// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The client half of the send-once guarantee. The server refuses to send twice
 * under one idempotency key; these tests prove the client supplies the right
 * key — the same one on a retry, a new one for a new reply.
 */

const API = 'http://anchor.test';
const TICKET_ID = 'b3085b5b-0bf4-4e73-93b5-331a65ff4392';

function ticketPayload() {
  const now = new Date();
  return {
    ticket: {
      id: TICKET_ID,
      number: 1001,
      brandId: 'CD',
      brand: 'CD',
      subject: 'Where is my order?',
      status: 'new',
      priority: 3,
      channel: 'email',
      intent: 'wismo',
      sentiment: -0.2,
      orderNumber: 'CD-118402',
      mailbox: 'care@carolsdaughter.com',
      assigneeId: null,
      unread: true,
      slaDueAt: new Date(now.getTime() + 3_600_000).toISOString(),
      lastMessageAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      tags: [],
      customerId: 'c-1',
      orderSnapshot: null,
      conversationId: 'CONV-1',
      resolvedAt: null,
    },
    customer: {
      id: 'c-1',
      email: 'tanya@example.com',
      name: 'Tanya Whitfield',
      phone: null,
      lifetimeOrders: 14,
      lifetimeValue: '612.40',
      vip: true,
      createdAt: '2022-03-11T00:00:00.000Z',
    },
    messages: [
      {
        id: 'm1',
        direction: 'inbound',
        authorEmail: 'tanya@example.com',
        authorName: 'Tanya Whitfield',
        bodyText: 'Tracking has not moved.',
        bodyHtml: null,
        hasAttachments: false,
        draftedByAi: false,
        editedByHuman: false,
        sentAt: now.toISOString(),
        createdAt: now.toISOString(),
      },
    ],
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface SendCall {
  body: string;
  idempotencyKey: string;
}

/** Routes GETs to the ticket payload and captures POSTed replies. */
function mockApi(replyHandler: (call: SendCall) => Response) {
  const sends: SendCall[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    if (init?.method === 'POST' && href.includes('/reply')) {
      const call = JSON.parse(String(init.body)) as SendCall;
      sends.push(call);
      return replyHandler(call);
    }
    return json(ticketPayload());
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sends, fetchMock };
}

async function renderTicket() {
  const { TicketView } = await import('@/screens/TicketView');
  return render(
    <MemoryRouter initialEntries={[`/tickets/${TICKET_ID}`]}>
      <Routes>
        <Route path="/tickets/:id" element={<TicketView />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function composeAndSend(text: string) {
  const box = await screen.findByPlaceholderText(/Write your reply here/);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Send reply/ }));
}

describe('sending a reply', () => {
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

  it('posts the reply with an idempotency key', async () => {
    const { sends } = mockApi(() => json({ status: 'sent', ticketId: TICKET_ID, messageId: 'm2' }));

    await renderTicket();
    await composeAndSend('Your replacement ships today.');

    await waitFor(() => expect(sends).toHaveLength(1));
    expect(sends[0]!.body).toBe('Your replacement ships today.');
    expect(sends[0]!.idempotencyKey).toBeTruthy();
  });

  it('reuses the same key when a failed send is retried', async () => {
    // The whole guarantee rests on this. A new key on retry would mean a
    // second email to the customer.
    let attempt = 0;
    const { sends } = mockApi(() => {
      attempt++;
      return attempt === 1
        ? json({ error: 'graph_failed', message: 'mailbox busy' }, 502)
        : json({ status: 'sent', ticketId: TICKET_ID, messageId: 'm2' });
    });

    await renderTicket();
    await composeAndSend('Please retry me.');

    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());
    fireEvent.click(screen.getByText('Try again'));

    await waitFor(() => expect(sends).toHaveLength(2));
    expect(sends[1]!.idempotencyKey).toBe(sends[0]!.idempotencyKey);
  });

  it('uses a fresh key for a genuinely new reply', async () => {
    const { sends } = mockApi(() => json({ status: 'sent', ticketId: TICKET_ID, messageId: 'm2' }));

    await renderTicket();
    await composeAndSend('First reply.');
    await waitFor(() => expect(sends).toHaveLength(1));

    await composeAndSend('Second reply.');
    await waitFor(() => expect(sends).toHaveLength(2));

    expect(sends[1]!.idempotencyKey).not.toBe(sends[0]!.idempotencyKey);
  });

  it('tells the agent to retry rather than rewrite when the outcome is unknown', async () => {
    // On a network failure the mail may already be gone. Rewriting would mint a
    // new key and could send it twice.
    mockApi(() => {
      throw new TypeError('Failed to fetch');
    });

    await renderTicket();
    await composeAndSend('Did this go out?');

    await waitFor(() =>
      expect(screen.getByText(/Could not confirm whether the reply was sent/)).toBeTruthy(),
    );
    expect(screen.getByText(/cannot email the customer twice/)).toBeTruthy();
    expect(screen.getByText(/Do not rewrite the reply/)).toBeTruthy();
  });

  it('explains a 409 as already in flight, not as a failure to send', async () => {
    mockApi(() => json({ error: 'send_in_flight' }, 409));

    await renderTicket();
    await composeAndSend('Double clicked.');

    await waitFor(() =>
      expect(screen.getByText(/This reply is already being sent/)).toBeTruthy(),
    );
    expect(screen.getByText(/will not send twice/)).toBeTruthy();
  });

  it('surfaces a mailbox rejection with the server message', async () => {
    mockApi(() => json({ error: 'graph_failed', message: 'Mailbox is over quota' }, 502));

    await renderTicket();
    await composeAndSend('Nope.');

    await waitFor(() => expect(screen.getByText(/Outlook rejected the reply/)).toBeTruthy());
    expect(screen.getByText(/Mailbox is over quota/)).toBeTruthy();
  });

  it('blocks a second submit while the first is still in flight', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sends: SendCall[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url);
        if (init?.method === 'POST' && href.includes('/reply')) {
          sends.push(JSON.parse(String(init.body)) as SendCall);
          await gate;
          return json({ status: 'sent', ticketId: TICKET_ID, messageId: 'm2' });
        }
        return json(ticketPayload());
      }),
    );

    await renderTicket();
    await composeAndSend('Impatient.');

    await waitFor(() => expect(screen.getByText('Sending…')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Sending/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sending/ }));

    release?.();
    await waitFor(() => expect(screen.queryByText('Sending…')).toBeNull());
    expect(sends).toHaveLength(1);
  });

  it('does not send an empty reply', async () => {
    const { sends } = mockApi(() => json({ status: 'sent', ticketId: TICKET_ID, messageId: null }));

    await renderTicket();
    const box = await screen.findByPlaceholderText(/Write your reply here/);
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Send reply/ }));

    expect(sends).toHaveLength(0);
  });
});
