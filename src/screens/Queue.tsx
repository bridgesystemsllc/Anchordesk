import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Inbox, RefreshCw, Sparkles, UserPlus, X } from 'lucide-react';
import { BRAND_ORDER, BRANDS, INTENT_SHORT, STATUS_LABEL } from '@/data/brands';
import { AGENTS, ME } from '@/data/mock';
import { isLive, listQueue } from '@/data/source';
import type { BrandCode, Intent, TicketStatus } from '@/data/types';
import type { QueueItem } from '@/data/view';
import { Avatar, BrandChip, EmptyState, SlaRing, StatusBadge } from '@/components/ui';
import { useResource } from '@/hooks/useResource';
import { apiErrorMessage } from '@/lib/api';
import { cx, shortAge, slaProgress } from '@/lib/utils';

type Sort = 'sla' | 'newest' | 'priority';

/** Live tickets refresh on their own; a queue that goes stale is a queue nobody trusts. */
const POLL_MS = 30_000;

const FULFILLMENT_TONE: Record<string, string> = {
  unfulfilled: 'badge-neutral',
  in_transit: 'badge-info',
  out_for_delivery: 'badge-info',
  delivered: 'badge-success',
  exception: 'badge-danger',
};

const FULFILLMENT_LABEL: Record<string, string> = {
  unfulfilled: 'Unfulfilled',
  in_transit: 'In transit',
  out_for_delivery: 'Out for del.',
  delivered: 'Delivered',
  exception: 'Exception',
};

export function Queue({ mineOnly = false }: { mineOnly?: boolean }) {
  const navigate = useNavigate();
  const [brand, setBrand] = useState<BrandCode | 'all'>('all');
  const [status, setStatus] = useState<TicketStatus | 'open_all'>('open_all');
  const [intent, setIntent] = useState<Intent | 'all'>('all');
  const [assignee, setAssignee] = useState<string>(mineOnly ? ME.id : 'all');
  const [sort, setSort] = useState<Sort>('sla');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filters = useMemo(
    () => ({
      status,
      ...(brand !== 'all' ? { brand } : {}),
      ...(intent !== 'all' ? { intent } : {}),
      ...(assignee === 'unassigned' ? { unassigned: true } : {}),
      ...(assignee !== 'all' && assignee !== 'unassigned' ? { assignee } : {}),
    }),
    [status, brand, intent, assignee],
  );

  const fetcher = useCallback((signal: AbortSignal) => listQueue(filters, signal), [filters]);

  const { data, error, loading, refreshing, refetch } = useResource<QueueItem[]>(
    JSON.stringify(filters),
    fetcher,
    { pollMs: isLive ? POLL_MS : undefined },
  );

  const rows = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      switch (sort) {
        case 'newest':
          return +new Date(b.createdAt) - +new Date(a.createdAt);
        case 'priority':
          return a.priority - b.priority;
        default:
          return slaProgress(b.createdAt, b.slaDueAt) - slaProgress(a.createdAt, a.slaDueAt);
      }
    });
  }, [data, sort]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <>
      <div className="filter-bar">
        <select className="form-select" value={brand} onChange={(e) => setBrand(e.target.value as BrandCode | 'all')}>
          <option value="all">All brands</option>
          {BRAND_ORDER.map((b) => (
            <option key={b} value={b}>
              {BRANDS[b].name}
            </option>
          ))}
        </select>

        <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus | 'open_all')}>
          <option value="open_all">Open work</option>
          {(['new', 'open', 'pending', 'escalated', 'resolved', 'closed'] as TicketStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <select className="form-select" value={intent} onChange={(e) => setIntent(e.target.value as Intent | 'all')}>
          <option value="all">Any intent</option>
          {(Object.keys(INTENT_SHORT) as Intent[]).map((i) => (
            <option key={i} value={i}>
              {INTENT_SHORT[i]}
            </option>
          ))}
        </select>

        <select className="form-select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="all">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id === ME.id ? 'Me' : a.name}
            </option>
          ))}
        </select>

        <div className="ml-a row gap-10">
          <span className="t-xs t-ter mono">
            {loading ? '—' : `${rows.length} ticket${rows.length === 1 ? '' : 's'}`}
          </span>
          <button
            className="icon-btn"
            onClick={refetch}
            title={isLive ? `Refreshing every ${POLL_MS / 1000}s` : 'Refresh'}
            aria-label="Refresh"
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : undefined} />
          </button>
          <div className="tab-bar">
            {(
              [
                ['sla', 'SLA risk'],
                ['newest', 'Newest'],
                ['priority', 'Priority'],
              ] as [Sort, string][]
            ).map(([k, label]) => (
              <button key={k} className={cx('tab', sort === k && 'active')} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="page flush" style={{ position: 'relative' }}>
        {error !== undefined && (
          <div className="callout callout-warn" style={{ margin: '12px 22px 0' }}>
            <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
            <span className="grow">
              {apiErrorMessage(error)}
              {data ? ' Showing the last data received.' : ''}
            </span>
            <button className="btn btn-sm btn-secondary" onClick={refetch}>
              Retry
            </button>
          </div>
        )}

        <div className="table-header">
          <button
            className={cx('checkbox', allChecked && 'checked')}
            onClick={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
            aria-label="Select all"
          >
            {allChecked && <Check size={10} strokeWidth={3.5} />}
          </button>
          <span>#</span>
          <span>Subject</span>
          <span>Customer</span>
          <span>Brand</span>
          <span>Intent</span>
          <span>Order</span>
          <span>Own</span>
          <span>Age</span>
          <span>SLA</span>
        </div>

        {loading ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState
            glyph={<Inbox size={26} />}
            title={error !== undefined ? 'Nothing to show' : 'Nothing in this view'}
            body={
              error !== undefined
                ? 'The queue could not be loaded. Check the server is running and try again.'
                : isLive
                  ? 'No tickets match the current filters. New mail lands here within seconds of arriving in a brand mailbox.'
                  : 'No tickets match the current filters.'
            }
          />
        ) : (
          rows.map((t, i) => (
            <Row
              key={t.id}
              t={t}
              index={i}
              selected={selected.has(t.id)}
              onToggle={toggle}
              onOpen={() => navigate(`/tickets/${t.id}`)}
            />
          ))
        )}

        {selected.size > 0 && (
          <div className="bulk-bar glass">
            <span className="bulk-count">{selected.size} selected</span>
            <button className="btn btn-sm btn-secondary">
              <UserPlus size={13} /> Assign
            </button>
            <button className="btn btn-sm btn-secondary">Set status</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Skeletons, not a spinner — the row rhythm is visible before the data lands. */
function SkeletonRows() {
  return (
    <div aria-busy="true" aria-label="Loading tickets">
      {Array.from({ length: 8 }, (_, i) => (
        <div className="queue-row" key={i} style={{ animationDelay: `${i * 30}ms`, cursor: 'default' }}>
          <span />
          <span className="skeleton" style={{ width: 30 }} />
          <div className="col gap-6" style={{ width: '100%' }}>
            <span className="skeleton" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
            <span className="skeleton" style={{ width: `${35 + ((i * 7) % 30)}%`, height: 9 }} />
          </div>
          <span className="skeleton" style={{ width: '80%' }} />
          <span className="skeleton" style={{ width: 46 }} />
          <span className="skeleton" style={{ width: 52 }} />
          <span className="skeleton" style={{ width: 62 }} />
          <span className="skeleton" style={{ width: 22, height: 22, borderRadius: '50%' }} />
          <span className="skeleton" style={{ width: 18 }} />
          <span className="skeleton" style={{ width: 52 }} />
        </div>
      ))}
    </div>
  );
}

function Row({
  t,
  index,
  selected,
  onToggle,
  onOpen,
}: {
  t: QueueItem;
  index: number;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={cx('queue-row', selected && 'selected')}
      style={{ animationDelay: `${Math.min(index * 22, 260)}ms` }}
      onClick={onOpen}
    >
      <button
        className={cx('checkbox', selected && 'checked')}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(t.id);
        }}
        aria-label={`Select ticket ${t.number}`}
      >
        {selected && <Check size={10} strokeWidth={3.5} />}
      </button>

      <span className="mono t-xs t-ter">{t.number}</span>

      <div className="queue-subject">
        <div className="row gap-6">
          {t.unread && <span className="unread-mark" />}
          <span className="queue-subject-line">{t.subject}</span>
          {t.aiDraftReady && (
            <span className="ai-ready" title="AI draft ready to review">
              <Sparkles size={9} strokeWidth={2.5} /> DRAFT
            </span>
          )}
        </div>
        <div className="queue-preview">{t.preview}</div>
      </div>

      <div className="queue-customer">
        {t.customer ? (
          <>
            <Avatar name={t.customer.name} size="sm" muted />
            <span className="queue-customer-name truncate">
              {t.customer.name}
              {t.customer.vip && <span style={{ color: 'var(--warning)' }}> ★</span>}
            </span>
          </>
        ) : (
          <span className="t-xs t-ter">—</span>
        )}
      </div>

      <BrandChip brand={t.brand} />

      <span className="chip">{INTENT_SHORT[t.intent]}</span>

      {t.orderStatus ? (
        <span className={cx('badge', FULFILLMENT_TONE[t.orderStatus])}>
          {FULFILLMENT_LABEL[t.orderStatus]}
        </span>
      ) : t.orderNumber ? (
        <span className="chip mono truncate" title={t.orderNumber}>
          {t.orderNumber}
        </span>
      ) : (
        <span className="t-xs t-ter">—</span>
      )}

      {t.assignee ? (
        <Avatar name={t.assignee.name} size="sm" />
      ) : (
        <span className="t-xs t-ter" style={{ textAlign: 'center' }}>
          —
        </span>
      )}

      <span className="mono t-xs t-ter">{shortAge(t.createdAt)}</span>

      {t.status === 'resolved' || t.status === 'closed' ? (
        <StatusBadge status={t.status} />
      ) : (
        <SlaRing createdAt={t.createdAt} dueAt={t.slaDueAt} />
      )}
    </div>
  );
}
