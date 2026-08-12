import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { storeMessage } from './store';
import type { NormalizedMessage } from './normalize';
import { closeDb, db } from '../db/client';
import { csCustomers, csMessages, csTickets } from '../db/schema';
import { migrate } from '../db/migrate';

/**
 * Exercises the transactional write path against a real Postgres — the
 * threading, reopen and idempotency rules can't be verified any other way.
 *
 *   createdb anchor_test
 *   TEST_DATABASE_URL=postgres://localhost/anchor_test npm test
 */
const RUN = Boolean(process.env.TEST_DATABASE_URL);
const suite = RUN ? describe : describe.skip;

const BASE: NormalizedMessage = {
  graphMessageId: 'msg-1',
  internetMessageId: '<a@example.com>',
  conversationId: 'CONV-1',
  mailbox: 'care@carolsdaughter.com',
  brandCode: 'CD',
  direction: 'inbound',
  subject: 'Order CD-118402 still in transit',
  bodyText: "Tracking hasn't moved since the 6th.",
  bodyHtml: '<p>…</p>',
  preview: "Tracking hasn't moved",
  hasAttachments: false,
  sentAt: new Date('2026-08-11T11:39:00Z'),
  counterpartyEmail: 'tanya.whitfield@gmail.com',
  counterpartyName: 'Tanya Whitfield',
  authorEmail: 'tanya.whitfield@gmail.com',
  authorName: 'Tanya Whitfield',
  intent: 'wismo',
  priority: 3,
  sentiment: -0.4,
  orderNumber: 'CD-118402',
  slaDueAt: new Date('2026-08-11T15:39:00Z'),
};

/**
 * Distinct mail gets a distinct Internet Message-Id, matching reality — two
 * messages sharing one Message-Id are the same mail, and storeMessage is right
 * to collapse them. Tests that care about that pass an explicit value.
 */
const msg = (o: Partial<NormalizedMessage> = {}): NormalizedMessage => {
  const merged = { ...BASE, ...o };
  if (!('internetMessageId' in o)) {
    merged.internetMessageId = `<${merged.graphMessageId}@example.com>`;
  }
  return merged;
};

suite('storeMessage', () => {
  beforeAll(async () => {
    await migrate();
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE cs_messages, cs_tickets, cs_customers RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('creates a ticket and a customer from the first inbound message', async () => {
    const outcome = await storeMessage(msg());
    expect(outcome.status).toBe('created');

    const [ticket] = await db.select().from(csTickets);
    expect(ticket).toBeDefined();
    expect(ticket!.status).toBe('new');
    expect(ticket!.unread).toBe(true);
    expect(ticket!.brandId).toBe('CD');
    expect(ticket!.orderNumber).toBe('CD-118402');
    expect(ticket!.conversationId).toBe('CONV-1');
    // Age and SLA are anchored to when the mail was sent, not to ingest time.
    expect(ticket!.createdAt.toISOString()).toBe('2026-08-11T11:39:00.000Z');

    const [customer] = await db.select().from(csCustomers);
    expect(customer!.email).toBe('tanya.whitfield@gmail.com');
    expect(customer!.name).toBe('Tanya Whitfield');
  });

  it('threads a reply onto the same ticket via conversationId', async () => {
    await storeMessage(msg());
    const outcome = await storeMessage(
      msg({ graphMessageId: 'msg-2', bodyText: 'Any update?', sentAt: new Date('2026-08-11T13:00:00Z') }),
    );

    expect(outcome.status).toBe('appended');
    expect(await count(csTickets)).toBe(1);
    expect(await count(csMessages)).toBe(2);
  });

  it('starts a separate ticket for a different conversation', async () => {
    await storeMessage(msg());
    await storeMessage(msg({ graphMessageId: 'msg-2', conversationId: 'CONV-2' }));
    expect(await count(csTickets)).toBe(2);
  });

  it('collapses two Graph ids carrying the same Internet Message-Id', async () => {
    // This is how our own sent reply comes back from Sent Items: same mail,
    // new Graph id. Without this the agent sees their reply twice.
    await storeMessage(msg({ graphMessageId: 'draft-id', internetMessageId: '<same@mail>' }));
    const echoed = await storeMessage(
      msg({ graphMessageId: 'sent-items-id', internetMessageId: '<same@mail>' }),
    );

    expect(echoed.status).toBe('duplicate');
    expect(await count(csMessages)).toBe(1);

    const [stored] = await db.select().from(csMessages);
    // The row adopts the canonical id so later passes stop at the cheap check.
    expect(stored!.graphMessageId).toBe('sent-items-id');
  });

  it('ignores a redelivered message rather than writing it twice', async () => {
    // Graph redelivers when an acknowledgement is slow — this is the guarantee
    // that stops a customer getting a duplicate reply, or a duplicate refund.
    await storeMessage(msg());
    const outcome = await storeMessage(msg());

    expect(outcome.status).toBe('duplicate');
    expect(await count(csMessages)).toBe(1);
    expect(await count(csTickets)).toBe(1);
  });

  it('creates exactly one ticket when a thread arrives concurrently', async () => {
    // Two notifications for the same conversation landing at once is the race
    // the per-conversation advisory lock exists to prevent.
    const results = await Promise.all([
      storeMessage(msg({ graphMessageId: 'race-1' })),
      storeMessage(msg({ graphMessageId: 'race-2' })),
      storeMessage(msg({ graphMessageId: 'race-3' })),
    ]);

    expect(await count(csTickets)).toBe(1);
    expect(await count(csMessages)).toBe(3);
    expect(results.filter((r) => r.status === 'created')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'appended')).toHaveLength(2);
  });

  it('marks a ticket as waiting on the customer when we reply', async () => {
    await storeMessage(msg());
    await storeMessage(
      msg({
        graphMessageId: 'msg-2',
        direction: 'outbound',
        authorEmail: 'care@carolsdaughter.com',
        authorName: 'Care Team',
      }),
    );

    const [ticket] = await db.select().from(csTickets);
    expect(ticket!.status).toBe('pending');
    expect(ticket!.unread).toBe(false);
  });

  it('reopens a recently resolved ticket when the customer writes back', async () => {
    await storeMessage(msg());
    await db.update(csTickets).set({ status: 'resolved', resolvedAt: new Date() });

    const outcome = await storeMessage(msg({ graphMessageId: 'msg-2', bodyText: 'Still broken.' }));
    expect(outcome.status).toBe('appended');

    const [ticket] = await db.select().from(csTickets);
    expect(ticket!.status).toBe('open');
    expect(ticket!.resolvedAt).toBeNull();
    expect(ticket!.unread).toBe(true);
  });

  it('starts a fresh ticket when an old thread is revived months later', async () => {
    await storeMessage(msg());
    const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60_000);
    await db.update(csTickets).set({ status: 'closed', resolvedAt: longAgo });

    const outcome = await storeMessage(msg({ graphMessageId: 'msg-2', bodyText: 'New problem.' }));
    expect(outcome.status).toBe('created');
    expect(await count(csTickets)).toBe(2);
  });

  it('ratchets priority up within a thread but never quietly down', async () => {
    await storeMessage(msg({ priority: 3 }));
    await storeMessage(msg({ graphMessageId: 'msg-2', priority: 1 }));
    expect((await db.select().from(csTickets))[0]!.priority).toBe(1);

    await storeMessage(msg({ graphMessageId: 'msg-3', priority: 4 }));
    expect((await db.select().from(csTickets))[0]!.priority).toBe(1);
  });

  it('attaches an order number discovered on a later message', async () => {
    await storeMessage(msg({ orderNumber: null }));
    expect((await db.select().from(csTickets))[0]!.orderNumber).toBeNull();

    await storeMessage(msg({ graphMessageId: 'msg-2', orderNumber: 'CD-118402' }));
    expect((await db.select().from(csTickets))[0]!.orderNumber).toBe('CD-118402');
  });

  it('dedups a customer across mailboxes and keeps the name already on file', async () => {
    await storeMessage(msg());
    await storeMessage(
      msg({
        graphMessageId: 'msg-2',
        conversationId: 'CONV-2',
        mailbox: 'support@dermablend.com',
        brandCode: 'DB',
        counterpartyName: null,
      }),
    );

    const customers = await db.select().from(csCustomers);
    expect(customers).toHaveLength(1);
    expect(customers[0]!.name).toBe('Tanya Whitfield');
  });

  it('assigns sequential ticket numbers', async () => {
    await storeMessage(msg());
    await storeMessage(msg({ graphMessageId: 'msg-2', conversationId: 'CONV-2' }));

    const numbers = (await db.select({ number: csTickets.number }).from(csTickets)).map(
      (r) => r.number,
    );
    expect(new Set(numbers).size).toBe(2);
    expect(Math.abs(numbers[0]! - numbers[1]!)).toBe(1);
  });
});

async function count(table: typeof csTickets | typeof csMessages | typeof csCustomers) {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return rows[0]?.n ?? 0;
}
