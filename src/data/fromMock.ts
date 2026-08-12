import { TICKETS, agentById, customerById } from './mock';
import type { Ticket } from './types';
import type { QueueItem, TicketDetail } from './view';

/** Projects the bundled demo dataset into the same view models the API produces. */

export function mockToQueueItem(t: Ticket): QueueItem {
  const customer = customerById(t.customerId);
  const owner = agentById(t.assigneeId);

  return {
    id: t.id,
    number: t.number,
    brand: t.brand,
    subject: t.subject,
    preview: t.preview,
    status: t.status,
    priority: t.priority,
    channel: t.channel,
    intent: t.intent,
    orderNumber: t.orderNumber ?? null,
    orderStatus: t.order?.fulfillmentStatus ?? null,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      vip: customer.vip,
    },
    assignee: owner ? { id: owner.id, name: owner.name } : null,
    unread: t.unread,
    aiDraftReady: t.aiDraftReady,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    slaDueAt: t.slaDueAt,
    messageCount: t.messages.length,
  };
}

export function mockToTicketDetail(t: Ticket): TicketDetail {
  const customer = customerById(t.customerId);
  const owner = agentById(t.assigneeId);

  return {
    id: t.id,
    number: t.number,
    brand: t.brand,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    channel: t.channel,
    intent: t.intent,
    sentiment: t.sentiment,
    orderNumber: t.orderNumber ?? null,
    order: t.order ?? null,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      vip: customer.vip,
      phone: customer.phone,
      lifetimeOrders: customer.lifetimeOrders,
      lifetimeValue: customer.lifetimeValue,
      since: customer.since,
    },
    assignee: owner ? { id: owner.id, name: owner.name } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    slaDueAt: t.slaDueAt,
    tags: t.tags,
    messages: t.messages,
    aiSummary: t.aiSummary,
    aiDraft: t.aiDraft ?? null,
    citations: t.citations,
    policyHits: t.policyHits,
    similar: TICKETS.filter((o) => o.id !== t.id && o.intent === t.intent)
      .slice(0, 3)
      .map((o) => ({
        id: o.id,
        number: o.number,
        subject: o.subject,
        brand: o.brand,
        createdAt: o.createdAt,
      })),
  };
}
