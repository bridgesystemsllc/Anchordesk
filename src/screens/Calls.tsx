import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, PhoneIncoming, PhoneOutgoing, Plus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { LogCallModal } from '@/components/LogCallModal';
import { Avatar, Badge, EmptyState } from '@/components/ui';
import { CALLS, agentById, customerById } from '@/data/mock';
import { cx, duration, fullStamp } from '@/lib/utils';

export type CallsStatus = 'ready' | 'loading' | 'empty' | 'error';

export interface CallsViewProps {
  status?: CallsStatus;
  onRetry?: () => void;
}

const OUTCOME_TONE = {
  resolved: 'success',
  callback: 'warning',
  escalated: 'danger',
  no_answer: 'neutral',
} as const;

const OUTCOME_LABEL = {
  resolved: 'Resolved',
  callback: 'Callback',
  escalated: 'Escalated',
  no_answer: 'No answer',
} as const;

export function CallsView({ status = 'ready', onRetry }: CallsViewProps) {
  const [q, setQ] = useState('');
  const [logging, setLogging] = useState(false);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = [...CALLS].sort((a, b) => +new Date(b.at) - +new Date(a.at));
    if (!n) return list;
    return list.filter((c) => {
      const cust = customerById(c.customerId);
      return (
        cust.name.toLowerCase().includes(n) ||
        c.phone.includes(n) ||
        c.notes.toLowerCase().includes(n) ||
        String(c.ticketNumber ?? '').includes(n)
      );
    });
  }, [q]);

  const totalMin = Math.round(CALLS.reduce((s, c) => s + c.durationSec, 0) / 60);

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Calls</h1>
            <p className="page-sub">Loading calls...</p>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <RefreshCw size={24} className="spin" style={{ color: 'var(--text-tertiary)' }} />
        </div>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Calls</h1>
            <p className="page-sub">No calls logged</p>
          </div>
        </div>
        <EmptyState
          glyph={<PhoneIncoming size={26} />}
          title="No calls yet"
          body="Calls will appear here once agents start logging them."
          action={
            <button className="btn btn-primary" onClick={() => setLogging(true)}>
              <Plus size={14} /> Log call
            </button>
          }
        />
        {logging && <LogCallModal onClose={() => setLogging(false)} />}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Calls</h1>
            <p className="page-sub">Error loading calls</p>
          </div>
        </div>
        <div className="callout callout-warn" style={{ margin: '24px 0' }}>
          <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
          <div>
            <strong>Calls could not be loaded</strong>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              The call log could not be loaded. Live call ingest is not this ticket.
            </p>
          </div>
        </div>
        {onRetry && (
          <button className="btn btn-primary" onClick={onRetry} style={{ alignSelf: 'flex-start' }}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Calls</h1>
          <p className="page-sub">
            {CALLS.length} logged this week · {totalMin} minutes on the phone · manual logging (Path A)
          </p>
        </div>
        <div className="ml-a row gap-8">
          <div className="search-trigger" style={{ minWidth: 240, cursor: 'text' }}>
            <Search size={14} />
            <input
              className="cmdk-input"
              style={{ fontSize: 13 }}
              placeholder="Search calls…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setLogging(true)}>
            <Plus size={14} /> Log call
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          glyph={<PhoneIncoming size={26} />}
          title="No calls match"
          body="Try a different name, number, or ticket. Calls logged from a ticket also appear here."
        />
      ) : (
        <div className="col gap-12 stagger">
          {rows.map((c) => {
            const customer = customerById(c.customerId);
            const agent = agentById(c.agentId);
            const Icon = c.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
            return (
              <div className="card card-pad" key={c.id}>
                <div className="row gap-12">
                  <span
                    className="empty-glyph"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      boxShadow: 'none',
                      color: c.direction === 'inbound' ? 'var(--info)' : 'var(--accent)',
                    }}
                  >
                    <Icon size={15} />
                  </span>
                  <div className="col" style={{ lineHeight: 1.4, minWidth: 0 }}>
                    <span className="row gap-6">
                      <strong style={{ fontSize: 13.5 }}>{customer.name}</strong>
                      <span className="mono t-xs t-ter">{c.phone}</span>
                    </span>
                    <span className="t-xs t-ter">
                      {fullStamp(c.at)} · {c.direction} ·{' '}
                      {c.durationSec ? duration(c.durationSec) : 'no connect'}
                    </span>
                  </div>
                  <div className="ml-a row gap-8">
                    {c.ticketNumber && (
                      <Link to={`/tickets/${c.ticketId}`} className="chip mono">
                        #{c.ticketNumber}
                      </Link>
                    )}
                    <Badge tone={OUTCOME_TONE[c.outcome]}>{OUTCOME_LABEL[c.outcome]}</Badge>
                    {agent && <Avatar name={agent.name} size="sm" />}
                  </div>
                </div>

                <p className="t-sm t-sec" style={{ lineHeight: 1.6, marginTop: 10 }}>
                  {c.notes}
                </p>

                <div
                  className={cx('row gap-6 t-xs')}
                  style={{ marginTop: 8, color: 'var(--accent)' }}
                >
                  <Sparkles size={11} />
                  {c.aiSummary}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logging && <LogCallModal onClose={() => setLogging(false)} />}
    </div>
  );
}

export function Calls() {
  return <CallsView status="ready" />;
}
