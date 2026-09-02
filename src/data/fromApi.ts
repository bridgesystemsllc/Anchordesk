import type { BrandCode, Channel, Intent, Message, TicketStatus } from './types';
import type { CustomerRef, QueueItem, TicketDetail } from './view';

/** Wire shapes returned by the server. Everything is nullable — this is JSON. */
export interface ApiQueueRow {
  id: string;
  number: number;
  brand: string;
  subject: string | null;
  status: string;
  priority: number;
  channel: string;
  intent: string | null;
  sentiment: number | null;
  orderNumber: string | null;
  mailbox: string;
  assigneeId: string | null;
  unread: boolean;
  slaDueAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[] | null;
  preview: string | null;
  messageCount: number | null;
  aiDraftReady: boolean | null;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerVip: boolean | null;
}

export interface ApiTicketRow extends Omit<ApiQueueRow, 'preview' | 'messageCount' | 'customerId' | 'customerName' | 'customerEmail' | 'customerVip'> {
  brandId: string;
  customerId: string | null;
  orderSnapshot: unknown;
  conversationId: string | null;
  resolvedAt: string | null;
  aiSummary: string[] | null;
  policyHits: { title: string; text: string; chunkId?: string }[] | null;
}

export interface ApiDraft {
  bodyText: string;
  citations: { items: { n: number; label: string; source: string; snippet: string }[] } | null;
  draftedByAi: boolean;
}

export interface ApiSimilarTicket {
  id: string;
  number: number;
  subject: string;
  brand: string;
  createdAt: string;
}

export interface ApiCustomer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  lifetimeOrders: number;
  lifetimeValue: string | number | null;
  vip: boolean;
  createdAt: string;
}

export interface ApiMessage {
  id: string;
  direction: string;
  authorEmail: string | null;
  authorName: string | null;
  bodyText: string;
  bodyHtml: string | null;
  hasAttachments: boolean;
  draftedByAi: boolean;
  editedByHuman: boolean;
  sentAt: string | null;
  createdAt: string;
}

const BRANDS = new Set<BrandCode>(['CD', 'DB', 'BOC', 'AMBI', 'AF']);
const STATUSES = new Set<TicketStatus>([
  'new',
  'open',
  'pending',
  'escalated',
  'resolved',
  'closed',
]);
const INTENTS = new Set<Intent>(['wismo', 'return', 'refund', 'damage', 'product_q', 'supervisor', 'other']);
const CHANNELS = new Set<Channel>(['email', 'phone', 'manual']);

/**
 * The server is trusted but not assumed correct. A column that drifts, or a
 * value written before a constraint existed, must not blank out a queue row —
 * every enum falls back to something renderable.
 */
function asBrand(v: string): BrandCode {
  return BRANDS.has(v as BrandCode) ? (v as BrandCode) : 'CD';
}
function asStatus(v: string): TicketStatus {
  return STATUSES.has(v as TicketStatus) ? (v as TicketStatus) : 'open';
}
function asIntent(v: string | null): Intent {
  return v && INTENTS.has(v as Intent) ? (v as Intent) : 'other';
}
function asChannel(v: string): Channel {
  return CHANNELS.has(v as Channel) ? (v as Channel) : 'email';
}

/** Postgres numerics arrive as strings to preserve precision. */
function asNumber(v: string | number | null | undefined, fallback = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function customerRef(row: ApiQueueRow): CustomerRef | null {
  if (!row.customerId) return null;
  return {
    id: row.customerId,
    // A customer who has never given a name still needs something to render.
    name: row.customerName?.trim() || row.customerEmail || 'Unknown sender',
    email: row.customerEmail ?? '',
    vip: Boolean(row.customerVip),
  };
}

function firstLine(text: string | null): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function toQueueItem(row: ApiQueueRow): QueueItem {
  return {
    id: row.id,
    number: row.number,
    brand: asBrand(row.brand),
    subject: row.subject?.trim() || '(no subject)',
    preview: firstLine(row.preview),
    status: asStatus(row.status),
    priority: row.priority ?? 3,
    channel: asChannel(row.channel),
    intent: asIntent(row.intent),
    orderNumber: row.orderNumber,
    orderStatus: null,
    customer: customerRef(row),
    assignee: row.assigneeId ? { id: row.assigneeId, name: row.assigneeId } : null,
    unread: Boolean(row.unread),
    aiDraftReady: Boolean(row.aiDraftReady),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    slaDueAt: row.slaDueAt ?? row.createdAt,
    messageCount: row.messageCount ?? 0,
  };
}

export function toMessage(m: ApiMessage): Message {
  return {
    id: m.id,
    kind: m.direction === 'outbound' ? 'outbound' : 'inbound',
    authorName: m.authorName?.trim() || m.authorEmail || 'Unknown',
    authorEmail: m.authorEmail ?? undefined,
    body: m.bodyText,
    at: m.sentAt ?? m.createdAt,
    draftedByAi: m.draftedByAi,
    editedByHuman: m.editedByHuman,
  };
}

export function toTicketDetail(payload: {
  ticket: ApiTicketRow;
  customer: ApiCustomer | null;
  messages: ApiMessage[];
  draft?: ApiDraft | null;
  similar?: ApiSimilarTicket[];
}): TicketDetail {
  const { ticket, customer, messages, draft, similar } = payload;

  return {
    id: ticket.id,
    number: ticket.number,
    brand: asBrand(ticket.brandId ?? ticket.brand),
    subject: ticket.subject?.trim() || '(no subject)',
    status: asStatus(ticket.status),
    priority: ticket.priority ?? 3,
    channel: asChannel(ticket.channel),
    intent: asIntent(ticket.intent),
    sentiment: asNumber(ticket.sentiment, 0),
    orderNumber: ticket.orderNumber,
    order: null,
    customer: {
      id: customer?.id ?? ticket.customerId ?? 'unknown',
      name: customer?.name?.trim() || customer?.email || 'Unknown sender',
      email: customer?.email ?? '',
      vip: Boolean(customer?.vip),
      phone: customer?.phone ?? undefined,
      lifetimeOrders: customer?.lifetimeOrders ?? 0,
      lifetimeValue: asNumber(customer?.lifetimeValue, 0),
      since: customer?.createdAt,
    },
    assignee: ticket.assigneeId ? { id: ticket.assigneeId, name: ticket.assigneeId } : null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    slaDueAt: ticket.slaDueAt ?? ticket.createdAt,
    tags: ticket.tags ?? [],
    messages: messages.map(toMessage),
    aiSummary: ticket.aiSummary ?? [],
    aiDraft: draft?.bodyText ?? null,
    citations: draft?.citations?.items ?? [],
    policyHits: ticket.policyHits ?? [],
    similar: (similar ?? []).map((s) => ({
      id: s.id,
      number: s.number,
      subject: s.subject,
      brand: asBrand(s.brand),
      createdAt: s.createdAt,
    })),
  };
}
