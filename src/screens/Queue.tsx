import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Inbox, Sparkles, UserPlus, X } from 'lucide-react';
import { BRAND_ORDER, BRANDS, INTENT_SHORT, STATUS_LABEL } from '@/data/brands';
import { AGENTS, ME, TICKETS, agentById, customerById } from '@/data/mock';
import type { BrandCode, Intent, Ticket, TicketStatus } from '@/data/types';
import { Avatar, BrandChip, EmptyState, SlaRing, StatusBadge } from '@/components/ui';
import { cx, shortAge, slaProgress } from '@/lib/utils';

type Sort = 'sla' | 'newest' | 'oldest' | 'priority';

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
  const [params] = useSearchParams();
  const [brand, setBrand] = useState<BrandCode | 'all'>('all');
  const [status, setStatus] = useState<TicketStatus | 'open_all'>('open_all');
  const [intent, setIntent] = useState<Intent | 'all'>('all');
  const [assignee, setAssignee] = useState<string>(mineOnly ? ME.id : 'all');
  const [sort, setSort] = useState<Sort>('sla');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const customerFilter = params.get('customer');

  const rows = useMemo(() => {
    let list = TICKETS.filter((t) => {
      if (brand !== 'all' && t.brand !== brand) return false;
      if (status === 'open_all') {
        if (t.status === 'resolved' || t.status === 'closed') return false;
      } else if (t.status !== status) return false;
      if (intent !== 'all' && t.intent !== intent) return false;
      if (assignee === 'unassigned' && t.assigneeId) return false;
      if (assignee !== 'all' && assignee !== 'unassigned' && t.assigneeId !== assignee) return false;
      if (customerFilter && t.customerId !== customerFilter) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'newest':
          return +new Date(b.createdAt) - +new Date(a.createdAt);
        case 'oldest':
          return +new Date(a.createdAt) - +new Date(b.createdAt);
        case 'priority':
          return a.priority - b.priority;
        default:
          return slaProgress(b.createdAt, b.slaDueAt) - slaProgress(a.createdAt, a.slaDueAt);
      }
    });
    return list;
  }, [brand, status, intent, assignee, sort, customerFilter]);

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
            {rows.length} ticket{rows.length === 1 ? '' : 's'}
          </span>
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

        {rows.length === 0 ? (
          <EmptyState
            glyph={<Inbox size={26} />}
            title="Nothing in this view"
            body="No tickets match the current filters. Every brand mailbox is still syncing — new mail lands here within seconds."
          />
        ) : (
          rows.map((t, i) => <Row key={t.id} t={t} index={i} selected={selected.has(t.id)} onToggle={toggle} onOpen={() => navigate(`/tickets/${t.id}`)} />)
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

function Row({
  t,
  index,
  selected,
  onToggle,
  onOpen,
}: {
  t: Ticket;
  index: number;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: () => void;
}) {
  const customer = customerById(t.customerId);
  const owner = agentById(t.assigneeId);

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
        <Avatar name={customer.name} size="sm" muted />
        <span className="queue-customer-name truncate">
          {customer.name}
          {customer.vip && <span style={{ color: 'var(--warning)' }}> ★</span>}
        </span>
      </div>

      <BrandChip brand={t.brand} />

      <span className="chip">{INTENT_SHORT[t.intent]}</span>

      {t.order ? (
        <span className={cx('badge', FULFILLMENT_TONE[t.order.fulfillmentStatus])}>
          {FULFILLMENT_LABEL[t.order.fulfillmentStatus]}
        </span>
      ) : (
        <span className="t-xs t-ter">—</span>
      )}

      {owner ? <Avatar name={owner.name} size="sm" /> : <span className="t-xs t-ter" style={{ textAlign: 'center' }}>—</span>}

      <span className="mono t-xs t-ter">{shortAge(t.createdAt)}</span>

      {t.status === 'resolved' || t.status === 'closed' ? (
        <StatusBadge status={t.status} />
      ) : (
        <SlaRing createdAt={t.createdAt} dueAt={t.slaDueAt} />
      )}
    </div>
  );
}
