import { apiGet, apiPost, isLive } from '@/lib/api';
import { TICKETS, ticketById } from './mock';
import { mockToQueueItem, mockToTicketDetail } from './fromMock';
import {
  toQueueItem,
  toTicketDetail,
  type ApiCustomer,
  type ApiDraft,
  type ApiMessage,
  type ApiQueueRow,
  type ApiSimilarTicket,
  type ApiTicketRow,
} from './fromApi';
import type { QueueFilters, QueueItem, TicketDetail } from './view';
import type { Citation, SimilarTicket } from './types';

export { isLive };

const OPEN_STATES = new Set(['new', 'open', 'pending', 'escalated']);

function queryString(filters: QueueFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.brand) params.set('brand', filters.brand);
  if (filters.intent) params.set('intent', filters.intent);
  if (filters.assignee) params.set('assignee', filters.assignee);
  if (filters.unassigned) params.set('unassigned', 'true');
  params.set('limit', String(filters.limit ?? 100));
  return params.toString();
}

/**
 * Filtering happens server-side in live mode so the queue stays correct beyond
 * one page, and in-memory against the demo dataset otherwise. Sorting is always
 * client-side — it is a view preference, not a query.
 */
export async function listQueue(
  filters: QueueFilters,
  signal?: AbortSignal,
): Promise<QueueItem[]> {
  if (!isLive) {
    return TICKETS.filter((t) => {
      if (filters.status === 'open_all' || !filters.status) {
        if (!OPEN_STATES.has(t.status)) return false;
      } else if (t.status !== filters.status) return false;
      if (filters.brand && t.brand !== filters.brand) return false;
      if (filters.intent && t.intent !== filters.intent) return false;
      if (filters.unassigned && t.assigneeId) return false;
      if (filters.assignee && t.assigneeId !== filters.assignee) return false;
      return true;
    }).map(mockToQueueItem);
  }

  const payload = await apiGet<{ tickets: ApiQueueRow[] }>(
    `/api/tickets?${queryString(filters)}`,
    signal,
  );
  return (payload.tickets ?? []).map(toQueueItem);
}

export async function getTicket(id: string, signal?: AbortSignal): Promise<TicketDetail | null> {
  if (!isLive) {
    const t = ticketById(id);
    return t ? mockToTicketDetail(t) : null;
  }

  const payload = await apiGet<{
    ticket: ApiTicketRow;
    customer: ApiCustomer | null;
    messages: ApiMessage[];
    draft?: ApiDraft | null;
    similar?: ApiSimilarTicket[];
  }>(`/api/tickets/${encodeURIComponent(id)}`, signal);

  return toTicketDetail(payload);
}

export interface SendReplyResult {
  status: 'sent' | 'already_sent';
  ticketId: string;
  messageId: string | null;
}

export interface SendReplyInput {
  body: string;
  idempotencyKey: string;
  draftedByAi?: boolean;
  editedByHuman?: boolean;
  originalDraft?: string;
  citations?: { items: Citation[] };
}

/**
 * Sends a reply. `idempotencyKey` must stay stable across retries of the same
 * composed message — that is what makes a double-click, a lost response, or a
 * timeout resolve to one email rather than two.
 */
export async function sendReply(
  ticketId: string,
  input: SendReplyInput,
): Promise<SendReplyResult> {
  if (!isLive) {
    return { status: 'sent', ticketId, messageId: null };
  }
  return apiPost<SendReplyResult>(`/api/tickets/${encodeURIComponent(ticketId)}/reply`, input);
}

export interface GenerateDraftResult {
  text: string;
  citations: Citation[];
  uncited: string[];
  blocked: boolean;
  neverDeflect: boolean;
  run: { id: string; costUsd: number; latencyMs: number };
}

export async function generateDraft(ticketId: string, signal?: AbortSignal): Promise<GenerateDraftResult> {
  if (!isLive) {
    return {
      text: 'Thank you for contacting us. Let me look into this for you.',
      citations: [],
      uncited: [],
      blocked: false,
      neverDeflect: false,
      run: { id: 'mock-run', costUsd: 0.002, latencyMs: 1200 },
    };
  }
  return apiPost<GenerateDraftResult>(
    `/api/tickets/${encodeURIComponent(ticketId)}/draft`,
    {},
    signal,
  );
}

export interface SummarizeResult {
  bullets: string[];
  run: { id: string; costUsd: number; latencyMs: number };
}

export async function summarizeThread(ticketId: string, signal?: AbortSignal): Promise<SummarizeResult> {
  if (!isLive) {
    return {
      bullets: ['Customer reported order not delivered', 'Tracking shows stuck in transit'],
      run: { id: 'mock-run', costUsd: 0.001, latencyMs: 800 },
    };
  }
  return apiPost<SummarizeResult>(
    `/api/tickets/${encodeURIComponent(ticketId)}/summarize`,
    {},
    signal,
  );
}

export interface PolicyHit {
  title: string;
  text: string;
  chunkId: string;
}

export interface PolicyCheckResult {
  hits: PolicyHit[];
  emptyReason?: 'no_chunks';
  run?: { id: string; costUsd: number; latencyMs: number };
}

export async function checkPolicy(ticketId: string, signal?: AbortSignal): Promise<PolicyCheckResult> {
  if (!isLive) {
    return {
      hits: [],
      emptyReason: 'no_chunks',
      run: { id: 'mock-run', costUsd: 0, latencyMs: 50 },
    };
  }
  return apiPost<PolicyCheckResult>(
    `/api/tickets/${encodeURIComponent(ticketId)}/policy-check`,
    {},
    signal,
  );
}

export interface SimilarTicketsResult {
  similar: SimilarTicket[];
  run: { id: string; costUsd: number; latencyMs: number };
}

export async function getSimilarTickets(ticketId: string, signal?: AbortSignal): Promise<SimilarTicketsResult> {
  if (!isLive) {
    return {
      similar: [],
      run: { id: 'mock-run', costUsd: 0, latencyMs: 30 },
    };
  }
  return apiPost<SimilarTicketsResult>(
    `/api/tickets/${encodeURIComponent(ticketId)}/similar`,
    {},
    signal,
  );
}

export interface MailboxHealth {
  brand: string;
  address: string;
  healthy: boolean;
  problems: string[];
  lastSyncAt: string | null;
  expiresInMinutes: number | null;
}

export interface IngestHealth {
  ok: boolean;
  mailboxes: MailboxHealth[];
}

/**
 * Surfaces ingest health in the shell. A subscription lapsing without anyone
 * noticing is the single most likely way this system stops working, so it
 * belongs somewhere the team already looks — not only in a monitor.
 */
export async function getIngestHealth(signal?: AbortSignal): Promise<IngestHealth> {
  if (!isLive) {
    return {
      ok: true,
      mailboxes: ['CD', 'DB', 'BOC', 'AMBI', 'AF'].map((brand) => ({
        brand,
        address: '',
        healthy: true,
        problems: [],
        lastSyncAt: new Date().toISOString(),
        expiresInMinutes: 8640,
      })),
    };
  }

  // 503 is the unhealthy answer, and its body is the part worth reading.
  return apiGet<IngestHealth>('/api/health/ingest', signal, [503]);
}

/**
 * Backs the ⌘K palette. In live mode there is no search endpoint yet, so this
 * pulls a recent page and matches client-side — correct for a few hundred open
 * tickets, and the point at which it stops being correct is the point a real
 * search endpoint is warranted.
 */
export async function searchTickets(signal?: AbortSignal): Promise<QueueItem[]> {
  return listQueue({ status: 'open_all', limit: 200 }, signal);
}

export interface ShopifyLineItem {
  id: string;
  title: string;
  sku: string;
  quantity: number;
  price: string;
}

export interface ShopifyCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  ordersCount: number;
  totalSpent: string;
}

export interface ShopifyAddress {
  address1: string;
  city: string;
  province: string;
  zip: string;
  country: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  email: string;
  customer: ShopifyCustomer;
  createdAt: string;
  fulfillmentStatus: string;
  financialStatus: string;
  totalPrice: string;
  currency: string;
  lineItems: ShopifyLineItem[];
  shippingAddress: ShopifyAddress | null;
  vip: boolean;
}

export type ShopifyLookupBy = 'number' | 'email' | 'name';

export interface ShopifyLookupResult {
  orders: ShopifyOrder[];
  demo: boolean;
}

export async function lookupShopifyOrders(
  q: string,
  by: ShopifyLookupBy,
  signal?: AbortSignal,
): Promise<ShopifyLookupResult> {
  if (!isLive) {
    return { orders: [], demo: true };
  }
  const params = new URLSearchParams({ q, by });
  return apiGet<ShopifyLookupResult>(`/api/shopify/orders?${params}`, signal);
}

export interface AttachOrderResult {
  ok: boolean;
  ticketId: string;
  snapshotId: string;
}

export async function attachOrderToTicket(
  ticketId: string,
  shopifyOrderId: string,
  signal?: AbortSignal,
): Promise<AttachOrderResult> {
  if (!isLive) {
    return { ok: true, ticketId, snapshotId: 'demo-snapshot' };
  }
  return apiPost<AttachOrderResult>(
    `/api/tickets/${encodeURIComponent(ticketId)}/attach-order`,
    { shopifyOrderId },
    signal,
  );
}
