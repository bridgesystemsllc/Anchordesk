import { describe, expect, it } from 'vitest';
import { toMessage, toQueueItem, toTicketDetail, type ApiQueueRow } from './fromApi';

function row(overrides: Partial<ApiQueueRow> = {}): ApiQueueRow {
  return {
    id: 'b3f1c2a4-0000-4000-8000-000000000001',
    number: 1042,
    brand: 'CD',
    subject: 'Order CD-118402 still in transit',
    status: 'new',
    priority: 3,
    channel: 'email',
    intent: 'wismo',
    sentiment: -0.4,
    orderNumber: 'CD-118402',
    mailbox: 'care@carolsdaughter.com',
    assigneeId: null,
    unread: true,
    slaDueAt: '2026-08-11T15:39:00.000Z',
    lastMessageAt: '2026-08-11T11:39:00.000Z',
    createdAt: '2026-08-11T11:39:00.000Z',
    updatedAt: '2026-08-11T11:39:00.000Z',
    tags: [],
    preview: "Tracking hasn't   moved since\nthe 6th.",
    messageCount: 2,
    customerId: 'c-1',
    customerName: 'Tanya Whitfield',
    customerEmail: 'tanya.whitfield@gmail.com',
    customerVip: true,
    ...overrides,
  };
}

describe('toQueueItem', () => {
  it('maps a well-formed row', () => {
    const item = toQueueItem(row());
    expect(item.number).toBe(1042);
    expect(item.brand).toBe('CD');
    expect(item.intent).toBe('wismo');
    expect(item.customer).toEqual({
      id: 'c-1',
      name: 'Tanya Whitfield',
      email: 'tanya.whitfield@gmail.com',
      vip: true,
    });
  });

  it('collapses whitespace in the preview so rows stay one line', () => {
    expect(toQueueItem(row()).preview).toBe("Tracking hasn't moved since the 6th.");
  });

  it('falls back to the email when a customer has never given a name', () => {
    const item = toQueueItem(row({ customerName: null }));
    expect(item.customer?.name).toBe('tanya.whitfield@gmail.com');
  });

  it('handles a ticket with no customer at all', () => {
    const item = toQueueItem(row({ customerId: null, customerName: null, customerEmail: null }));
    expect(item.customer).toBeNull();
  });

  it('substitutes a placeholder subject rather than rendering blank', () => {
    expect(toQueueItem(row({ subject: '  ' })).subject).toBe('(no subject)');
    expect(toQueueItem(row({ subject: null })).subject).toBe('(no subject)');
  });

  it('falls back to a renderable value for an unknown enum', () => {
    // A value written before a constraint existed must not blank the row.
    const item = toQueueItem(row({ brand: 'XX', status: 'weird', intent: 'nonsense', channel: 'fax' }));
    expect(item.brand).toBe('CD');
    expect(item.status).toBe('open');
    expect(item.intent).toBe('other');
    expect(item.channel).toBe('email');
  });

  it('treats a null intent as other', () => {
    expect(toQueueItem(row({ intent: null })).intent).toBe('other');
  });

  it('falls back to createdAt when a ticket has no SLA, so sorting still works', () => {
    const item = toQueueItem(row({ slaDueAt: null }));
    expect(item.slaDueAt).toBe('2026-08-11T11:39:00.000Z');
  });

  it('handles a null preview and message count', () => {
    const item = toQueueItem(row({ preview: null, messageCount: null }));
    expect(item.preview).toBe('');
    expect(item.messageCount).toBe(0);
  });

  it('reports no order status until Shopify enrichment lands', () => {
    const item = toQueueItem(row());
    expect(item.orderStatus).toBeNull();
    expect(item.orderNumber).toBe('CD-118402');
  });
});

describe('toMessage', () => {
  it('maps direction onto the timeline kind', () => {
    const inbound = toMessage({
      id: 'm1',
      direction: 'inbound',
      authorEmail: 'a@b.com',
      authorName: 'A B',
      bodyText: 'hello',
      bodyHtml: null,
      hasAttachments: false,
      draftedByAi: false,
      editedByHuman: false,
      sentAt: '2026-08-11T11:39:00.000Z',
      createdAt: '2026-08-11T11:40:00.000Z',
    });
    expect(inbound.kind).toBe('inbound');
    // Sent time is what the customer experienced; ingest time is ours.
    expect(inbound.at).toBe('2026-08-11T11:39:00.000Z');
  });

  it('falls back to the ingest time when a message has no sent time', () => {
    const m = toMessage({
      id: 'm2',
      direction: 'outbound',
      authorEmail: null,
      authorName: null,
      bodyText: 'x',
      bodyHtml: null,
      hasAttachments: false,
      draftedByAi: false,
      editedByHuman: false,
      sentAt: null,
      createdAt: '2026-08-11T11:40:00.000Z',
    });
    expect(m.kind).toBe('outbound');
    expect(m.at).toBe('2026-08-11T11:40:00.000Z');
    expect(m.authorName).toBe('Unknown');
  });
});

describe('toTicketDetail', () => {
  const base = row();

  it('parses a Postgres numeric delivered as a string', () => {
    const detail = toTicketDetail({
      ticket: { ...base, brandId: 'DB', orderSnapshot: null, conversationId: 'c', resolvedAt: null },
      customer: {
        id: 'c-1',
        email: 'tanya.whitfield@gmail.com',
        name: 'Tanya Whitfield',
        phone: null,
        lifetimeOrders: 14,
        lifetimeValue: '612.40',
        vip: true,
        createdAt: '2022-03-11T00:00:00.000Z',
      },
      messages: [],
    });

    expect(detail.customer.lifetimeValue).toBe(612.4);
    expect(detail.brand).toBe('DB');
  });

  it('stays renderable when the ticket has no customer row yet', () => {
    const detail = toTicketDetail({
      ticket: { ...base, brandId: 'CD', orderSnapshot: null, conversationId: 'c', resolvedAt: null },
      customer: null,
      messages: [],
    });

    expect(detail.customer.name).toBe('Unknown sender');
    expect(detail.customer.lifetimeValue).toBe(0);
  });

  it('returns empty AI sections so the UI hides them rather than showing blanks', () => {
    const detail = toTicketDetail({
      ticket: { ...base, brandId: 'CD', orderSnapshot: null, conversationId: 'c', resolvedAt: null },
      customer: null,
      messages: [],
    });

    expect(detail.aiSummary).toEqual([]);
    expect(detail.citations).toEqual([]);
    expect(detail.policyHits).toEqual([]);
    expect(detail.aiDraft).toBeNull();
  });
});
