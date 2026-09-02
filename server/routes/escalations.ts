import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { csCustomers, csEscalations, csMessages, csTickets } from '../db/schema';
import { GraphError, postTeamsChannelMessage, type AdaptiveCardPayload } from '../graph/teams';
import { errFields, log } from '../log';
import { env } from '../env';

export const escalationsRouter = Router();

const createBody = z.object({
  ticketId: z.string().uuid(),
  channelId: z.string().min(1),
  userId: z.string().optional(),
});

const claimBody = z.object({
  userId: z.string().min(1),
});

escalationsRouter.post('/escalations', async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { ticketId, channelId, userId } = parsed.data;

  const [ticket] = await db
    .select({
      id: csTickets.id,
      number: csTickets.number,
      subject: csTickets.subject,
      brandId: csTickets.brandId,
      orderNumber: csTickets.orderNumber,
      tags: csTickets.tags,
      aiSummary: csTickets.aiSummary,
      customerId: csTickets.customerId,
    })
    .from(csTickets)
    .where(eq(csTickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    res.status(404).json({ error: 'not_found', message: 'Ticket not found' });
    return;
  }

  const customer = ticket.customerId
    ? (
        await db
          .select({
            name: csCustomers.name,
            vip: csCustomers.vip,
            lifetimeOrders: csCustomers.lifetimeOrders,
            lifetimeValue: csCustomers.lifetimeValue,
          })
          .from(csCustomers)
          .where(eq(csCustomers.id, ticket.customerId))
          .limit(1)
      )[0]
    : null;

  const repliesSent = await db
    .select({ count: csMessages.id })
    .from(csMessages)
    .where(and(eq(csMessages.ticketId, ticketId), eq(csMessages.direction, 'outbound')))
    .then((rows) => rows.length);

  const brandNames: Record<string, string> = {
    CD: "Carol's Daughter",
    DB: 'Dermablend',
    BOC: 'Baxter of California',
    AMBI: 'Ambi',
    AF: 'AcneFree',
  };

  const publicBaseUrl = env.PUBLIC_BASE_URL;
  const deepLink = `${publicBaseUrl}/tickets/${ticket.id}`;
  const aiSummary = ticket.aiSummary as string[] | null;

  const cardPayload: AdaptiveCardPayload = {
    ticketId: ticket.id,
    ticketNumber: ticket.number,
    subject: ticket.subject ?? 'No subject',
    summary: aiSummary?.[0] ?? null,
    brandName: brandNames[ticket.brandId] ?? ticket.brandId,
    customerName: customer?.name ?? 'Unknown',
    customerVip: customer?.vip ?? false,
    customerOrders: customer?.lifetimeOrders ?? 0,
    customerValue: customer?.lifetimeValue ? parseFloat(String(customer.lifetimeValue)) : 0,
    orderNumber: ticket.orderNumber,
    repliesSent,
    tags: ticket.tags ?? [],
    agentName: userId ?? 'Agent',
    deepLink,
  };

  let teamsMessageId: string;
  let teamsDeepLink: string;

  try {
    const result = await postTeamsChannelMessage(channelId, cardPayload);
    teamsMessageId = result.teamsMessageId;
    teamsDeepLink = result.deepLink;
  } catch (e) {
    if (e instanceof GraphError) {
      if (e.isNotFound) {
        res.status(404).json({ error: 'not_found', message: 'Channel not found' });
        return;
      }
      if (e.status >= 500) {
        log.error('teams post failed with 5xx', {
          ticketId,
          channelId,
          ...errFields(e),
        });
        res.status(503).json({ error: 'teams_unavailable', message: 'Teams service unavailable' });
        return;
      }
    }
    log.error('teams post failed', { ticketId, channelId, ...errFields(e) });
    res.status(503).json({ error: 'teams_unavailable', message: 'Teams service unavailable' });
    return;
  }

  const [escalation] = await db
    .insert(csEscalations)
    .values({
      ticketId,
      channelId,
      teamsMessageId,
      payload: cardPayload,
    })
    .returning({ id: csEscalations.id });

  res.json({
    ok: true,
    escalationId: escalation!.id,
    teamsMessageId,
    deepLink: teamsDeepLink,
  });
});

escalationsRouter.post('/escalations/:id/claim', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: 'invalid_body', message: 'Invalid escalation ID' });
    return;
  }

  const parsed = claimBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { userId } = parsed.data;

  const [escalation] = await db
    .select({
      id: csEscalations.id,
      claimedBy: csEscalations.claimedBy,
      claimedAt: csEscalations.claimedAt,
    })
    .from(csEscalations)
    .where(eq(csEscalations.id, id.data))
    .limit(1);

  if (!escalation) {
    res.status(404).json({ error: 'not_found', message: 'Escalation not found' });
    return;
  }

  if (escalation.claimedBy) {
    res.status(409).json({ error: 'already_claimed', message: 'Already claimed' });
    return;
  }

  const claimedAt = new Date();

  await db
    .update(csEscalations)
    .set({
      claimedBy: userId,
      claimedAt,
    })
    .where(eq(csEscalations.id, id.data));

  res.json({
    ok: true,
    escalationId: escalation.id,
    claimedBy: userId,
    claimedAt: claimedAt.toISOString(),
  });
});

escalationsRouter.get('/escalations', async (req, res) => {
  const ticketId = z.string().uuid().safeParse(req.query.ticketId);
  if (!ticketId.success) {
    res.status(400).json({ error: 'invalid_body', message: 'ticketId query parameter required' });
    return;
  }

  const escalations = await db
    .select({
      id: csEscalations.id,
      ticketId: csEscalations.ticketId,
      channelId: csEscalations.channelId,
      teamsMessageId: csEscalations.teamsMessageId,
      claimedBy: csEscalations.claimedBy,
      claimedAt: csEscalations.claimedAt,
      createdAt: csEscalations.createdAt,
    })
    .from(csEscalations)
    .where(eq(csEscalations.ticketId, ticketId.data))
    .orderBy(desc(csEscalations.createdAt));

  res.json({ escalations });
});
