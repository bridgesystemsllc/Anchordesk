import { and, desc, eq, sql } from 'drizzle-orm';
import type { NormalizedMessage } from './normalize';
import { db } from '../db/client';
import { csCustomers, csMessages, csTickets } from '../db/schema';
import { log } from '../log';

/**
 * A reply on a thread we closed long ago is a new problem, not a reopening of
 * the old one. Inside this window we reopen; outside it we start a fresh
 * ticket that still carries the same conversationId.
 */
const REOPEN_WINDOW_MS = 14 * 24 * 60 * 60_000;

export type StoreOutcome =
  | { status: 'created'; ticketId: string; ticketNumber: number; messageId: string }
  | { status: 'appended'; ticketId: string; ticketNumber: number; messageId: string }
  | { status: 'duplicate'; ticketId?: string };

/**
 * Writes one normalized message, exactly once.
 *
 * Two things make this safe under concurrent notifications for the same thread:
 * a transaction-scoped advisory lock keyed on (mailbox, conversationId), which
 * serialises ticket creation for a thread; and the unique index on
 * graph_message_id, which is the last line of defence. A duplicate reply to a
 * customer is embarrassing; a duplicate refund is worse.
 */
export async function storeMessage(msg: NormalizedMessage): Promise<StoreOutcome> {
  return db.transaction(async (tx) => {
    const lockKey = `${msg.mailbox}:${msg.conversationId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);

    const existing = await tx
      .select({ id: csMessages.id, ticketId: csMessages.ticketId })
      .from(csMessages)
      .where(eq(csMessages.graphMessageId, msg.graphMessageId))
      .limit(1);

    if (existing.length > 0) {
      return { status: 'duplicate', ticketId: existing[0]!.ticketId };
    }

    // Second identity check, on the Internet Message-Id. A reply we sent is
    // written immediately under its draft's Graph id, and Sent Items later
    // reconciles the same mail under a different one. The Message-Id survives
    // that transition, so without this the agent sees their own reply twice.
    if (msg.internetMessageId) {
      const sameMail = await tx
        .select({ id: csMessages.id, ticketId: csMessages.ticketId })
        .from(csMessages)
        .where(eq(csMessages.internetMessageId, msg.internetMessageId))
        .limit(1);

      if (sameMail.length > 0) {
        // Adopt the canonical Graph id so later delta passes short-circuit on
        // the cheaper check above.
        await tx
          .update(csMessages)
          .set({ graphMessageId: msg.graphMessageId })
          .where(eq(csMessages.id, sameMail[0]!.id));
        return { status: 'duplicate', ticketId: sameMail[0]!.ticketId };
      }
    }

    const customerId = await upsertCustomer(tx, msg);

    const [openTicket] = await tx
      .select()
      .from(csTickets)
      .where(
        and(eq(csTickets.mailbox, msg.mailbox), eq(csTickets.conversationId, msg.conversationId)),
      )
      .orderBy(desc(csTickets.createdAt))
      .limit(1);

    const reusable =
      openTicket &&
      !(
        (openTicket.status === 'resolved' || openTicket.status === 'closed') &&
        Date.now() - (openTicket.resolvedAt ?? openTicket.updatedAt).getTime() > REOPEN_WINDOW_MS
      );

    let ticketId: string;
    let ticketNumber: number;
    let created = false;

    if (reusable && openTicket) {
      ticketId = openTicket.id;
      ticketNumber = openTicket.number;
      await tx
        .update(csTickets)
        .set(ticketUpdateFor(msg, openTicket))
        .where(eq(csTickets.id, openTicket.id));
    } else {
      const [row] = await tx
        .insert(csTickets)
        .values({
          brandId: msg.brandCode,
          subject: msg.subject,
          // A thread that opens with our own message is already in progress.
          status: msg.direction === 'inbound' ? 'new' : 'pending',
          priority: msg.priority,
          channel: 'email',
          customerId,
          intent: msg.intent,
          sentiment: msg.sentiment,
          orderNumber: msg.orderNumber,
          conversationId: msg.conversationId,
          mailbox: msg.mailbox,
          unread: msg.direction === 'inbound',
          slaDueAt: msg.slaDueAt,
          lastMessageAt: msg.sentAt,
          // Backfilled mail keeps its real arrival time so age and SLA are
          // honest rather than all reading "just now".
          createdAt: msg.sentAt,
          updatedAt: msg.sentAt,
        })
        .returning({ id: csTickets.id, number: csTickets.number });

      if (!row) throw new Error('Ticket insert returned no row');
      ticketId = row.id;
      ticketNumber = row.number;
      created = true;
    }

    const [inserted] = await tx
      .insert(csMessages)
      .values({
        ticketId,
        graphMessageId: msg.graphMessageId,
        internetMessageId: msg.internetMessageId,
        direction: msg.direction,
        authorEmail: msg.authorEmail,
        authorName: msg.authorName,
        bodyText: msg.bodyText,
        bodyHtml: msg.bodyHtml,
        hasAttachments: msg.hasAttachments,
        sentAt: msg.sentAt,
      })
      .onConflictDoNothing({ target: csMessages.graphMessageId })
      .returning({ id: csMessages.id });

    // Lost the race against a concurrent writer holding no lock (a retry from a
    // prior process, say). The ticket work above is idempotent, so rolling
    // forward with 'duplicate' is correct.
    if (!inserted) return { status: 'duplicate', ticketId };

    return {
      status: created ? 'created' : 'appended',
      ticketId,
      ticketNumber,
      messageId: inserted.id,
    };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function upsertCustomer(tx: Tx, msg: NormalizedMessage): Promise<string | null> {
  if (!msg.counterpartyEmail) return null;

  const [row] = await tx
    .insert(csCustomers)
    .values({ email: msg.counterpartyEmail, name: msg.counterpartyName })
    .onConflictDoUpdate({
      target: csCustomers.email,
      // Never overwrite a name we already know with a blank or a mail-client alias.
      set: {
        name: sql`coalesce(${csCustomers.name}, excluded.name)`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: csCustomers.id });

  return row?.id ?? null;
}

type TicketRow = typeof csTickets.$inferSelect;

/** How an existing ticket moves when a new message lands on it. */
function ticketUpdateFor(msg: NormalizedMessage, ticket: TicketRow) {
  const patch: Partial<typeof csTickets.$inferInsert> = {
    lastMessageAt: msg.sentAt,
    updatedAt: new Date(),
  };

  // An order number discovered later is still worth attaching.
  if (!ticket.orderNumber && msg.orderNumber) patch.orderNumber = msg.orderNumber;

  if (msg.direction === 'inbound') {
    patch.unread = true;
    patch.sentiment = msg.sentiment;
    // The customer came back: this needs a human again, whatever it was before.
    if (ticket.status === 'resolved' || ticket.status === 'closed' || ticket.status === 'pending') {
      patch.status = 'open';
      patch.resolvedAt = null;
      patch.slaDueAt = msg.slaDueAt;
    }
    // Urgency can only ratchet up within a thread, never quietly down.
    if (msg.priority < ticket.priority) patch.priority = msg.priority;
  } else {
    patch.unread = false;
    // Someone replied — including from Outlook directly. Either way the ticket
    // is now waiting on the customer, not on us.
    if (ticket.status === 'new' || ticket.status === 'open') patch.status = 'pending';
  }

  return patch;
}

export function logOutcome(outcome: StoreOutcome, msg: NormalizedMessage): void {
  if (outcome.status === 'duplicate') {
    log.debug('message already ingested', {
      graphMessageId: msg.graphMessageId,
      mailbox: msg.mailbox,
    });
    return;
  }
  log.info(`ticket ${outcome.status}`, {
    ticket: outcome.ticketNumber,
    mailbox: msg.mailbox,
    brand: msg.brandCode,
    direction: msg.direction,
    intent: msg.intent,
    priority: msg.priority,
    orderNumber: msg.orderNumber,
  });
}
