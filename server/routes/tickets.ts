import { Router } from 'express';
import { and, asc, desc, eq, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { csCustomers, csMessages, csTickets } from '../db/schema';
import { SendError, sendReply } from '../ingest/outbound';
import { errFields, log } from '../log';

export const ticketsRouter = Router();

const OPEN_STATES = ['new', 'open', 'pending', 'escalated'] as const;

const listQuery = z.object({
  status: z.enum(['new', 'open', 'pending', 'escalated', 'resolved', 'closed', 'open_all']).default('open_all'),
  brand: z.enum(['CD', 'DB', 'BOC', 'AMBI', 'AF']).optional(),
  intent: z.enum(['wismo', 'return', 'refund', 'damage', 'product_q', 'other']).optional(),
  assignee: z.string().min(1).optional(),
  unassigned: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Keyset pagination: pass the previous page's last updatedAt. */
  before: z.coerce.date().optional(),
});

ticketsRouter.get('/tickets', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_query', issues: parsed.error.issues });
    return;
  }
  const q = parsed.data;

  const filters: SQL[] = [];
  if (q.status === 'open_all') filters.push(inArray(csTickets.status, [...OPEN_STATES]));
  else filters.push(eq(csTickets.status, q.status));
  if (q.brand) filters.push(eq(csTickets.brandId, q.brand));
  if (q.intent) filters.push(eq(csTickets.intent, q.intent));
  if (q.assignee) filters.push(eq(csTickets.assigneeId, q.assignee));
  if (q.before) filters.push(lt(csTickets.updatedAt, q.before));
  if (q.unassigned) filters.push(isNull(csTickets.assigneeId));

  const rows = await db
    .select({
      id: csTickets.id,
      number: csTickets.number,
      brand: csTickets.brandId,
      subject: csTickets.subject,
      status: csTickets.status,
      priority: csTickets.priority,
      channel: csTickets.channel,
      intent: csTickets.intent,
      sentiment: csTickets.sentiment,
      orderNumber: csTickets.orderNumber,
      mailbox: csTickets.mailbox,
      assigneeId: csTickets.assigneeId,
      unread: csTickets.unread,
      slaDueAt: csTickets.slaDueAt,
      lastMessageAt: csTickets.lastMessageAt,
      createdAt: csTickets.createdAt,
      updatedAt: csTickets.updatedAt,
      tags: csTickets.tags,
      // The queue shows a one-line preview under each subject. Derived from the
      // newest message rather than denormalized onto the ticket, so it can
      // never drift out of sync with the thread.
      preview: sql<string | null>`(
        select left(m.body_text, 200)
        from cs_messages m
        where m.ticket_id = ${csTickets.id}
        order by m.sent_at desc nulls last, m.created_at desc
        limit 1
      )`,
      messageCount: sql<number>`(
        select count(*)::int from cs_messages m where m.ticket_id = ${csTickets.id}
      )`,
      customerId: csCustomers.id,
      customerName: csCustomers.name,
      customerEmail: csCustomers.email,
      customerVip: csCustomers.vip,
    })
    .from(csTickets)
    .leftJoin(csCustomers, eq(csTickets.customerId, csCustomers.id))
    .where(and(...filters))
    .orderBy(desc(csTickets.updatedAt))
    .limit(q.limit);

  res.json({
    tickets: rows,
    nextBefore: rows.length === q.limit ? rows[rows.length - 1]?.updatedAt : null,
  });
});

const replyBody = z.object({
  body: z.string().trim().min(1, 'A reply cannot be empty').max(50_000),
  /**
   * Stable for one composed reply. The client generates it when the agent
   * starts typing, so a double-click or a retried request resolves to one send.
   */
  idempotencyKey: z.string().min(8).max(128),
  agentId: z.string().max(128).optional(),
});

ticketsRouter.post('/tickets/:id/reply', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  const parsed = replyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  try {
    const outcome = await sendReply({
      ticketId: id.data,
      bodyText: parsed.data.body,
      idempotencyKey: parsed.data.idempotencyKey,
      agentId: parsed.data.agentId ?? null,
    });

    // 409 tells the client a send is already running under this key, so the
    // correct response is to wait rather than to try again with a new one.
    if (outcome.status === 'in_flight') {
      res.status(409).json({ error: 'send_in_flight', ...outcome });
      return;
    }

    res.json(outcome);
  } catch (e) {
    if (e instanceof SendError) {
      const status =
        e.code === 'ticket_not_found'
          ? 404
          : e.code === 'graph_failed'
            ? 502
            : 409;
      res.status(status).json({ error: e.code, message: e.message });
      return;
    }
    log.error('reply route failed', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

ticketsRouter.get('/tickets/:id', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  const [ticket] = await db
    .select()
    .from(csTickets)
    .where(eq(csTickets.id, id.data))
    .limit(1);

  if (!ticket) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const [messages, customer] = await Promise.all([
    db
      .select()
      .from(csMessages)
      .where(eq(csMessages.ticketId, ticket.id))
      .orderBy(asc(csMessages.sentAt)),
    ticket.customerId
      ? db.select().from(csCustomers).where(eq(csCustomers.id, ticket.customerId)).limit(1)
      : Promise.resolve([]),
  ]);

  res.json({ ticket, customer: customer[0] ?? null, messages });
});
