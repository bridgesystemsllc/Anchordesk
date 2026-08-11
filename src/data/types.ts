/** Mirrors the Postgres model in §5 of the spec. */

export type BrandCode = 'CD' | 'DB' | 'BOC' | 'AMBI' | 'AF';

export type TicketStatus = 'new' | 'open' | 'pending' | 'escalated' | 'resolved' | 'closed';

export type Intent = 'wismo' | 'return' | 'refund' | 'damage' | 'product_q' | 'other';

export type Channel = 'email' | 'phone' | 'manual';

export interface Brand {
  code: BrandCode;
  name: string;
  short: string;
  color: string;
  mailbox: string;
  signature: string;
  voice: string;
  subscriptionRenewsAt: string;
  lastSyncAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  lifetimeOrders: number;
  lifetimeValue: number;
  vip: boolean;
  since: string;
}

export interface OrderLine {
  sku: string;
  name: string;
  qty: number;
  price: number;
}

export interface OrderSnapshot {
  number: string;
  placedAt: string;
  total: number;
  fulfillmentStatus: 'unfulfilled' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  carrier: string;
  tracking: string;
  eta?: string;
  lines: OrderLine[];
  shipTo: string;
}

export interface Citation {
  n: number;
  label: string;
  source: string;
  snippet: string;
}

export type MessageKind = 'inbound' | 'outbound' | 'note' | 'system' | 'call' | 'escalation';

export interface Message {
  id: string;
  kind: MessageKind;
  authorName: string;
  authorEmail?: string;
  body: string;
  at: string;
  draftedByAi?: boolean;
  editedByHuman?: boolean;
}

export interface Ticket {
  id: string;
  number: number;
  brand: BrandCode;
  subject: string;
  preview: string;
  status: TicketStatus;
  priority: 1 | 2 | 3 | 4;
  channel: Channel;
  customerId: string;
  assigneeId: string | null;
  intent: Intent;
  sentiment: number;
  orderNumber?: string;
  order?: OrderSnapshot;
  createdAt: string;
  updatedAt: string;
  slaDueAt: string;
  unread: boolean;
  aiDraftReady: boolean;
  aiSummary: string[];
  aiDraft?: string;
  citations: Citation[];
  policyHits: { title: string; text: string }[];
  tags: string[];
  messages: Message[];
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: 'agent' | 'lead' | 'admin';
  title: string;
  online: boolean;
}

export interface CallLog {
  id: string;
  ticketId?: string;
  ticketNumber?: number;
  customerId: string;
  agentId: string;
  direction: 'inbound' | 'outbound';
  phone: string;
  durationSec: number;
  outcome: 'resolved' | 'callback' | 'escalated' | 'no_answer';
  notes: string;
  aiSummary: string;
  at: string;
}

export interface SheetBinding {
  id: string;
  name: string;
  worksheet: string;
  columns: string[];
  rows: string[][];
  autoAppendOn: Intent | null;
  lastWriteAt: string;
  owner: string;
}
