import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const createReplyDraft = vi.fn();
const updateDraftBody = vi.fn();
const sendDraft = vi.fn();
const findSentByInternetMessageId = vi.fn();
const markHandledInOutlook = vi.fn();

vi.mock('../graph/mail', async () => {
  const actual = await vi.importActual<typeof import('../graph/mail')>('../graph/mail');
  return {
    ...actual,
    createReplyDraft: (...args: unknown[]) => createReplyDraft(...args),
    updateDraftBody: (...args: unknown[]) => updateDraftBody(...args),
    sendDraft: (...args: unknown[]) => sendDraft(...args),
    findSentByInternetMessageId: (...args: unknown[]) => findSentByInternetMessageId(...args),
    markHandledInOutlook: (...args: unknown[]) => markHandledInOutlook(...args),
  };
});

const { sendReply, SendError } = await import('./outbound');
const { storeMessage } = await import('./store');
const { db, closeDb } = await import('../db/client');
const { csMailboxes, csMessages, csOutboundSends, csTickets } = await import('../db/schema');
const { migrate } = await import('../db/migrate');
const { ingestQueue } = await import('../lib/serial');
const { normalizeMessage } = await import('./normalize');

/**
 * The send-once guarantee, exercised against a real database with Graph mocked.
 *
 *   createdb anchor_test
 *   TEST_DATABASE_URL=postgres://localhost/anchor_test npm test
 */
const RUN = Boolean(process.env.TEST_DATABASE_URL);
const suite = RUN ? describe : describe.skip;

const MAILBOX = 'care@carolsdaughter.com';

async function seedTicket(): Promise<string> {
  const result = normalizeMessage(
    {
      id: 'inbound-1',
      conversationId: 'CONV-OUT-1',
      internetMessageId: '<inbound-1@mail.example>',
      subject: 'Where is my order CD-118402?',
      from: { emailAddress: { name: 'Tanya Whitfield', address: 'tanya@example.com' } },
      toRecipients: [{ emailAddress: { address: MAILBOX } }],
      sentDateTime: new Date(Date.now() - 60 * 60_000).toISOString(),
      body: { contentType: 'text', content: 'Tracking has not moved since the 6th.' },
      isDraft: false,
    },
    { address: MAILBOX, brandCode: 'CD' },
  );
  if (!result.ok) throw new Error(`fixture failed to normalize: ${result.reason}`);
  const outcome = await storeMessage(result.message);
  if (outcome.status === 'duplicate') throw new Error('fixture already present');
  return outcome.ticketId;
}

suite('sendReply', () => {
  beforeAll(async () => {
    await migrate();
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE cs_outbound_sends, cs_messages, cs_tickets, cs_customers, cs_mailboxes RESTART IDENTITY CASCADE`,
    );
    await db.insert(csMailboxes).values({
      brandCode: 'CD',
      address: MAILBOX,
      graphUserId: MAILBOX,
      displayName: "Carol's Daughter Care",
      enabled: true,
    });

    vi.clearAllMocks();
    let n = 0;
    createReplyDraft.mockImplementation(async () => {
      n++;
      return { id: `draft-${n}`, internetMessageId: `<draft-${n}@outlook.example>` };
    });
    updateDraftBody.mockResolvedValue({});
    sendDraft.mockResolvedValue(undefined);
    findSentByInternetMessageId.mockResolvedValue(null);
    markHandledInOutlook.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await ingestQueue.drain();
    await closeDb();
  });

  it('sends a reply and puts it on the ticket', async () => {
    const ticketId = await seedTicket();

    const outcome = await sendReply({
      ticketId,
      bodyText: 'Your replacement ships today.',
      idempotencyKey: 'key-1',
    });

    expect(outcome.status).toBe('sent');
    expect(sendDraft).toHaveBeenCalledTimes(1);

    const messages = await db.select().from(csMessages);
    const outbound = messages.filter((m) => m.direction === 'outbound');
    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.bodyText).toBe('Your replacement ships today.');
    expect(outbound[0]!.internetMessageId).toBe('<draft-1@outlook.example>');
  });

  it('replies to the most recent inbound message so the thread holds', async () => {
    const ticketId = await seedTicket();
    const later = normalizeMessage(
      {
        id: 'inbound-2',
        conversationId: 'CONV-OUT-1',
        internetMessageId: '<inbound-2@mail.example>',
        subject: 'RE: Where is my order CD-118402?',
        from: { emailAddress: { address: 'tanya@example.com' } },
        toRecipients: [{ emailAddress: { address: MAILBOX } }],
        sentDateTime: new Date().toISOString(),
        body: { contentType: 'text', content: 'Any update?' },
        isDraft: false,
      },
      { address: MAILBOX, brandCode: 'CD' },
    );
    if (!later.ok) throw new Error('fixture failed');
    await storeMessage(later.message);

    await sendReply({ ticketId, bodyText: 'On its way.', idempotencyKey: 'key-thread' });

    expect(createReplyDraft).toHaveBeenCalledWith(MAILBOX, 'inbound-2');
  });

  it('moves the ticket to pending and clears unread', async () => {
    const ticketId = await seedTicket();
    await sendReply({ ticketId, bodyText: 'Replied.', idempotencyKey: 'key-status' });

    const [ticket] = await db.select().from(csTickets);
    expect(ticket!.status).toBe('pending');
    expect(ticket!.unread).toBe(false);
  });

  describe('send-once guarantee', () => {
    it('does not send twice for the same idempotency key', async () => {
      const ticketId = await seedTicket();
      const args = { ticketId, bodyText: 'Only once.', idempotencyKey: 'key-dupe' };

      const first = await sendReply(args);
      const second = await sendReply(args);

      expect(first.status).toBe('sent');
      expect(second.status).toBe('already_sent');
      // The part that actually reaches the customer must have run exactly once.
      expect(sendDraft).toHaveBeenCalledTimes(1);
      expect(createReplyDraft).toHaveBeenCalledTimes(1);

      const outbound = (await db.select().from(csMessages)).filter((m) => m.direction === 'outbound');
      expect(outbound).toHaveLength(1);
    });

    it('sends once when a double-click fires two requests at the same moment', async () => {
      const ticketId = await seedTicket();
      const args = { ticketId, bodyText: 'Double click.', idempotencyKey: 'key-race' };

      const results = await Promise.all([sendReply(args), sendReply(args), sendReply(args)]);

      expect(sendDraft).toHaveBeenCalledTimes(1);
      expect(results.filter((r) => r.status === 'sent')).toHaveLength(1);
      // The losers report the send is handled, never that it failed.
      expect(results.filter((r) => r.status === 'sent' || r.status === 'already_sent' || r.status === 'in_flight')).toHaveLength(3);

      const outbound = (await db.select().from(csMessages)).filter((m) => m.direction === 'outbound');
      expect(outbound).toHaveLength(1);
    });

    it('sends again for a genuinely new reply', async () => {
      const ticketId = await seedTicket();
      await sendReply({ ticketId, bodyText: 'First.', idempotencyKey: 'key-a' });
      await sendReply({ ticketId, bodyText: 'Second.', idempotencyKey: 'key-b' });

      expect(sendDraft).toHaveBeenCalledTimes(2);
      const outbound = (await db.select().from(csMessages)).filter((m) => m.direction === 'outbound');
      expect(outbound).toHaveLength(2);
    });
  });

  describe('failure handling', () => {
    it('records a failure and writes nothing to the ticket', async () => {
      const ticketId = await seedTicket();
      sendDraft.mockRejectedValueOnce(new Error('Graph exploded'));

      await expect(
        sendReply({ ticketId, bodyText: 'Nope.', idempotencyKey: 'key-fail' }),
      ).rejects.toBeInstanceOf(SendError);

      const [record] = await db.select().from(csOutboundSends);
      expect(record!.status).toBe('failed');
      expect(record!.error).toContain('Graph exploded');

      const outbound = (await db.select().from(csMessages)).filter((m) => m.direction === 'outbound');
      expect(outbound).toHaveLength(0);
    });

    it('lets the agent retry a failed send under the same key', async () => {
      const ticketId = await seedTicket();
      const args = { ticketId, bodyText: 'Retry me.', idempotencyKey: 'key-retry' };

      sendDraft.mockRejectedValueOnce(new Error('transient'));
      await expect(sendReply(args)).rejects.toBeInstanceOf(SendError);

      const outcome = await sendReply(args);
      expect(outcome.status).toBe('sent');

      const [record] = await db.select().from(csOutboundSends);
      expect(record!.status).toBe('sent');
      expect(record!.attempts).toBe(2);

      const outbound = (await db.select().from(csMessages)).filter((m) => m.direction === 'outbound');
      expect(outbound).toHaveLength(1);
    });

    it('refuses to send on a ticket with nothing to reply to', async () => {
      const [ticket] = await db
        .insert(csTickets)
        .values({ brandId: 'CD', mailbox: MAILBOX, subject: 'Manual', conversationId: 'CONV-X' })
        .returning({ id: csTickets.id });

      await expect(
        sendReply({ ticketId: ticket!.id, bodyText: 'Hello?', idempotencyKey: 'key-none' }),
      ).rejects.toMatchObject({ code: 'nothing_to_reply_to' });
      expect(sendDraft).not.toHaveBeenCalled();
    });

    it('refuses to send from a mailbox that is no longer configured', async () => {
      const ticketId = await seedTicket();
      await db.update(csMailboxes).set({ enabled: false });

      await expect(
        sendReply({ ticketId, bodyText: 'Hi.', idempotencyKey: 'key-nomailbox' }),
      ).rejects.toMatchObject({ code: 'mailbox_unavailable' });
      expect(sendDraft).not.toHaveBeenCalled();
    });

    it('rejects an unknown ticket', async () => {
      await expect(
        sendReply({
          ticketId: '11111111-1111-4111-8111-111111111111',
          bodyText: 'Hi.',
          idempotencyKey: 'key-noticket',
        }),
      ).rejects.toMatchObject({ code: 'ticket_not_found' });
    });
  });

  describe('reconciling our own sent mail', () => {
    it('does not show the reply twice when Sent Items reconciles it back', async () => {
      const ticketId = await seedTicket();
      await sendReply({ ticketId, bodyText: 'Shipping today.', idempotencyKey: 'key-echo' });

      // Sent Items returns the same mail under a different Graph id. Only the
      // Internet Message-Id survives, and it is what has to identify the mail.
      const echoed = normalizeMessage(
        {
          id: 'sent-items-id-9999',
          conversationId: 'CONV-OUT-1',
          internetMessageId: '<draft-1@outlook.example>',
          subject: 'RE: Where is my order CD-118402?',
          from: { emailAddress: { address: MAILBOX } },
          toRecipients: [{ emailAddress: { address: 'tanya@example.com' } }],
          sentDateTime: new Date().toISOString(),
          body: { contentType: 'text', content: 'Shipping today.' },
          isDraft: false,
        },
        { address: MAILBOX, brandCode: 'CD' },
      );
      if (!echoed.ok) throw new Error('fixture failed');
      const outcome = await storeMessage(echoed.message);

      expect(outcome.status).toBe('duplicate');
      const outbound = (await db.select().from(csMessages)).filter((m) => m.direction === 'outbound');
      expect(outbound).toHaveLength(1);
      // The row adopts the canonical id, so later passes stop at the cheap check.
      expect(outbound[0]!.graphMessageId).toBe('sent-items-id-9999');
    });

    it('stamps the real Sent Items id onto the message when Graph exposes it', async () => {
      const ticketId = await seedTicket();
      findSentByInternetMessageId.mockResolvedValue({ id: 'real-sent-id' });

      await sendReply({ ticketId, bodyText: 'Done.', idempotencyKey: 'key-reconcile' });
      await ingestQueue.drain();

      const outbound = (await db.select().from(csMessages)).filter((m) => m.direction === 'outbound');
      expect(outbound[0]!.graphMessageId).toBe('real-sent-id');

      const [record] = await db.select().from(csOutboundSends);
      expect(record!.sentGraphId).toBe('real-sent-id');
    });

    it('still succeeds when the sent copy cannot be located', async () => {
      const ticketId = await seedTicket();
      findSentByInternetMessageId.mockRejectedValue(new Error('not indexed yet'));

      const outcome = await sendReply({
        ticketId,
        bodyText: 'Done.',
        idempotencyKey: 'key-noecho',
      });
      await ingestQueue.drain();

      expect(outcome.status).toBe('sent');
      const outbound = (await db.select().from(csMessages)).filter((m) => m.direction === 'outbound');
      expect(outbound).toHaveLength(1);
    });
  });

  it('marks the original handled in Outlook so nobody replies twice by hand', async () => {
    const ticketId = await seedTicket();
    await sendReply({ ticketId, bodyText: 'Handled.', idempotencyKey: 'key-category' });
    await ingestQueue.drain();

    expect(markHandledInOutlook).toHaveBeenCalledWith(MAILBOX, 'inbound-1');
  });
});
