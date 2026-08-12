import { apiGet, isLive } from '@/lib/api';
import { TICKETS, ticketById } from './mock';
import { mockToQueueItem, mockToTicketDetail } from './fromMock';
import {
  toQueueItem,
  toTicketDetail,
  type ApiCustomer,
  type ApiMessage,
  type ApiQueueRow,
  type ApiTicketRow,
} from './fromApi';
import type { QueueFilters, QueueItem, TicketDetail } from './view';

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
  }>(`/api/tickets/${encodeURIComponent(id)}`, signal);

  return toTicketDetail(payload);
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
