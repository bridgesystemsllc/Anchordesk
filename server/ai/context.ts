/**
 * Context assembler for AI draft generation.
 * Loads ticket, customer, messages, order snapshot, and retrieved chunks.
 */

import { asc, eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { csCustomers, csMessages, csTickets } from '../db/schema';
import { getBrandVoice, type BrandVoice } from './brandVoice';
import { retriever, type KbChunk } from './retriever';

export interface ThreadMessage {
  direction: 'inbound' | 'outbound';
  authorName: string | null;
  body: string;
  sentAt: Date | null;
}

export interface OrderContext {
  number: string;
  placedAt?: string;
  total?: number;
  fulfillmentStatus?: string;
  carrier?: string;
  tracking?: string;
  eta?: string;
  shipTo?: string;
}

export interface DraftContext {
  ticketId: string;
  brandCode: string;
  voice: BrandVoice;
  subject: string;
  intent: string | null;
  thread: ThreadMessage[];
  order: OrderContext | null;
  chunks: KbChunk[];
  customerName: string | null;
}

const MAX_THREAD_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;

export async function assembleDraftContext(ticketId: string): Promise<DraftContext | null> {
  const [ticket] = await db
    .select()
    .from(csTickets)
    .where(eq(csTickets.id, ticketId))
    .limit(1);

  if (!ticket) return null;

  const [messages, customerRow] = await Promise.all([
    db
      .select({
        direction: csMessages.direction,
        authorName: csMessages.authorName,
        bodyText: csMessages.bodyText,
        sentAt: csMessages.sentAt,
        isDraft: csMessages.isDraft,
      })
      .from(csMessages)
      .where(and(eq(csMessages.ticketId, ticketId), eq(csMessages.isDraft, false)))
      .orderBy(asc(csMessages.sentAt))
      .limit(MAX_THREAD_MESSAGES),
    ticket.customerId
      ? db.select().from(csCustomers).where(eq(csCustomers.id, ticket.customerId)).limit(1)
      : Promise.resolve([]),
  ]);

  const thread: ThreadMessage[] = messages.map((m) => ({
    direction: m.direction as 'inbound' | 'outbound',
    authorName: m.authorName,
    body: m.bodyText.slice(0, MAX_MESSAGE_LENGTH),
    sentAt: m.sentAt,
  }));

  const lastInbound = thread.filter((m) => m.direction === 'inbound').pop();
  const query = `${ticket.subject ?? ''} ${lastInbound?.body ?? ''}`.trim();

  const chunks = await retriever.retrieve(query, {
    brandCode: ticket.brandId,
    limit: 6,
  });

  let order: OrderContext | null = null;
  if (ticket.orderSnapshot && typeof ticket.orderSnapshot === 'object') {
    const snap = ticket.orderSnapshot as Record<string, unknown>;
    order = {
      number: String(snap.number ?? ticket.orderNumber ?? ''),
      placedAt: snap.placedAt as string | undefined,
      total: snap.total as number | undefined,
      fulfillmentStatus: snap.fulfillmentStatus as string | undefined,
      carrier: snap.carrier as string | undefined,
      tracking: snap.tracking as string | undefined,
      eta: snap.eta as string | undefined,
      shipTo: snap.shipTo as string | undefined,
    };
  } else if (ticket.orderNumber) {
    order = { number: ticket.orderNumber };
  }

  return {
    ticketId,
    brandCode: ticket.brandId,
    voice: getBrandVoice(ticket.brandId),
    subject: ticket.subject ?? '(no subject)',
    intent: ticket.intent,
    thread,
    order,
    chunks,
    customerName: customerRow[0]?.name ?? null,
  };
}
