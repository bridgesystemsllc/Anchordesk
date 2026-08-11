import { useState } from 'react';
import { ArrowUpRight, Hash, Send, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { Avatar } from './ui';
import { AGENTS, ME, customerById } from '@/data/mock';
import { BRANDS } from '@/data/brands';
import type { Ticket } from '@/data/types';
import { cx, usd } from '@/lib/utils';

const CHANNELS = [
  { id: 'ch-ops', name: '#kareve-operations', team: 'KarEve Ops' },
  { id: 'ch-fin', name: '#kareve-finance', team: 'KarEve Ops' },
  { id: 'ch-ful', name: '#fulfillment-escalations', team: 'Supply Chain' },
];

export function EscalateModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const [target, setTarget] = useState<string>('u7');
  const [mode, setMode] = useState<'person' | 'channel'>('person');
  const [reason, setReason] = useState('Repeat packaging damage — needs a fulfillment fix, not a one-off replacement');
  const customer = customerById(ticket.customerId);
  const brand = BRANDS[ticket.brand];

  const targetName =
    mode === 'person'
      ? (AGENTS.find((a) => a.id === target)?.name ?? '')
      : (CHANNELS.find((c) => c.id === target)?.name ?? '');

  return (
    <Modal
      wide
      icon={<ArrowUpRight size={16} />}
      title="Escalate to Teams"
      subtitle={`Ticket #${ticket.number} · ${brand.name}`}
      onClose={onClose}
      footer={
        <>
          <span className="t-xs t-ter">
            Card posts as you, with a deep link back to this ticket.
          </span>
          <div className="ml-a row gap-6">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onClose} disabled={!targetName}>
              <Send size={13} /> Send card
            </button>
          </div>
        </>
      }
    >
      <div className="tab-bar" style={{ alignSelf: 'flex-start' }}>
        <button className={cx('tab', mode === 'person' && 'active')} onClick={() => { setMode('person'); setTarget('u7'); }}>
          Person
        </button>
        <button className={cx('tab', mode === 'channel' && 'active')} onClick={() => { setMode('channel'); setTarget('ch-ops'); }}>
          Channel
        </button>
      </div>

      <div className="form-group">
        <label className="form-label">{mode === 'person' ? 'Escalate to' : 'Post in'}</label>
        <div className="picker-list">
          {mode === 'person'
            ? AGENTS.filter((a) => a.id !== ME.id).map((a) => (
                <button key={a.id} className={cx('picker-row', target === a.id && 'selected')} onClick={() => setTarget(a.id)}>
                  <Avatar name={a.name} size="sm" muted={target !== a.id} />
                  <span className="col" style={{ lineHeight: 1.3 }}>
                    <span>{a.name}</span>
                    <span className="picker-sub">{a.title}</span>
                  </span>
                  {a.online && <span className="status-dot ml-a" style={{ color: 'var(--success)' }} />}
                </button>
              ))
            : CHANNELS.map((c) => (
                <button key={c.id} className={cx('picker-row', target === c.id && 'selected')} onClick={() => setTarget(c.id)}>
                  <Hash size={15} />
                  <span className="col" style={{ lineHeight: 1.3 }}>
                    <span>{c.name}</span>
                    <span className="picker-sub">{c.team}</span>
                  </span>
                </button>
              ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Reason</label>
        <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label row gap-6">
          <Sparkles size={12} style={{ color: 'var(--accent)' }} /> Adaptive Card preview
        </label>
        <div className="adaptive-card">
          <div className="adaptive-card-accent" />
          <div className="adaptive-card-body">
            <div className="adaptive-card-title">
              Escalation · #{ticket.number} · {ticket.subject}
            </div>
            <p className="t-sm t-sec" style={{ lineHeight: 1.55 }}>
              {ticket.aiSummary[0] ?? reason}
            </p>
            <dl className="adaptive-facts">
              <dt>Brand</dt>
              <dd>{brand.name}</dd>
              <dt>Customer</dt>
              <dd>
                {customer.name}
                {customer.vip ? ' · VIP' : ''} · {customer.lifetimeOrders} orders · {usd(customer.lifetimeValue)}
              </dd>
              {ticket.orderNumber && (
                <>
                  <dt>Order</dt>
                  <dd className="mono">{ticket.orderNumber}</dd>
                </>
              )}
              <dt>Tried</dt>
              <dd>{ticket.messages.filter((m) => m.kind === 'outbound').length} replies sent · {ticket.tags.join(', ') || 'no tags'}</dd>
              <dt>From</dt>
              <dd>{ME.name}</dd>
            </dl>
            <div className="adaptive-actions">
              <span className="btn btn-sm btn-primary" style={{ pointerEvents: 'none' }}>
                Open in Anchor Desk
              </span>
              <span className="btn btn-sm btn-secondary" style={{ pointerEvents: 'none' }}>
                Claim
              </span>
              <span className="btn btn-sm btn-secondary" style={{ pointerEvents: 'none' }}>
                Comment
              </span>
            </div>
          </div>
        </div>
        <p className="form-hint">
          Goes to <strong>{targetName || '—'}</strong>. Claiming from Teams writes straight back to this ticket.
        </p>
      </div>
    </Modal>
  );
}
