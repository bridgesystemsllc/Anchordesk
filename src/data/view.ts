import type {
  BrandCode,
  Channel,
  Citation,
  Intent,
  Message,
  OrderSnapshot,
  TicketStatus,
} from './types';

/**
 * View models the screens render.
 *
 * Deliberately separate from both the mock dataset and the API payload: the
 * demo data and the live server produce the same shapes, so a screen never
 * knows which one it is looking at. When AI drafts and Shopify enrichment land,
 * they widen these types, not the components.
 */

export interface PersonRef {
  id: string;
  name: string;
}

export interface CustomerRef {
  id: string;
  name: string;
  email: string;
  vip: boolean;
}

export interface QueueItem {
  id: string;
  number: number;
  brand: BrandCode;
  subject: string;
  preview: string;
  status: TicketStatus;
  priority: number;
  channel: Channel;
  intent: Intent;
  orderNumber: string | null;
  /** Null until Shopify enrichment attaches an order snapshot. */
  orderStatus: OrderSnapshot['fulfillmentStatus'] | null;
  customer: CustomerRef | null;
  assignee: PersonRef | null;
  unread: boolean;
  aiDraftReady: boolean;
  createdAt: string;
  updatedAt: string;
  slaDueAt: string;
  messageCount: number;
}

export interface TicketDetail {
  id: string;
  number: number;
  brand: BrandCode;
  subject: string;
  status: TicketStatus;
  priority: number;
  channel: Channel;
  intent: Intent;
  sentiment: number;
  orderNumber: string | null;
  order: OrderSnapshot | null;
  customer: CustomerRef & { phone?: string; lifetimeOrders: number; lifetimeValue: number; since?: string };
  assignee: PersonRef | null;
  createdAt: string;
  updatedAt: string;
  slaDueAt: string;
  tags: string[];
  messages: Message[];
  /** Empty until the Day 10–11 AI work lands; the UI hides these sections. */
  aiSummary: string[];
  aiDraft: string | null;
  citations: Citation[];
  policyHits: { title: string; text: string }[];
  similar: { id: string; number: number; subject: string; brand: BrandCode; createdAt: string }[];
}

export interface QueueFilters {
  status?: TicketStatus | 'open_all';
  brand?: BrandCode;
  intent?: Intent;
  assignee?: string;
  unassigned?: boolean;
  limit?: number;
}
