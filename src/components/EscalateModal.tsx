import { useState } from 'react';
import { AlertTriangle, ArrowUpRight, Check, Hash, Info, RefreshCw, Send, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { Avatar } from './ui';
import { AGENTS, ME } from '@/data/mock';
import { BRANDS } from '@/data/brands';
import { createEscalation, isLive } from '@/data/source';
import type { TicketDetail } from '@/data/view';
import { ApiError } from '@/lib/api';
import { cx, usd } from '@/lib/utils';

const CHANNELS = [
  { id: 'ch-ops', name: '#kareve-operations', team: 'KarEve Ops' },
  { id: 'ch-fin', name: '#kareve-finance', team: 'KarEve Ops' },
  { id: 'ch-ful', name: '#fulfillment-escalations', team: 'Supply Chain' },
];

function escalationErrorHeadline(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return 'Channel not found';
    if (e.status === 409) return 'Already claimed';
  }
  return 'Escalation could not be posted';
}

export function EscalateModal({ ticket, onClose }: { ticket: TicketDetail; onClose: () => void }) {
  const [target, setTarget] = useState<string>('ch-ops');
  const [mode, setMode] = useState<'person' | 'channel'>('channel');
  const [reason, setReason] = useState('Repeat packaging damage — needs a fulfillment fix, not a one-off replacement');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [demoMode, setDemoMode] = useState(!isLive);
  const [error, setError] = useState<unknown>(undefined);
  const customer = ticket.customer;
  const brand = BRANDS[ticket.brand];

  const targetName =
    mode === 'person'
      ? (AGENTS.find((a) => a.id === target)?.name ?? '')
      : (CHANNELS.find((c) => c.id === target)?.name ?? '');

  const handleSend = async () => {
    if (!target || sending) return;
    setSending(true);
    setError(undefined);

    try {
      const result = await createEscalation(ticket.id, target, ME.name);
      if (result.teamsMessageId === 'fixture-msg') {
        setDemoMode(true);
      }
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setSending(false);
    }
  };

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
              {sent ? 'Close' : 'Cancel'}
            </button>
            {!sent && (
              <button
                className="btn btn-primary"
                onClick={() => void handleSend()}
                disabled={!targetName || sending}
              >
                {sending ? (
                  <RefreshCw size={13} className="spin" />
                ) : (
                  <Send size={13} />
                )}
                {sending ? 'Sending…' : 'Send card'}
              </button>
            )}
          </div>
        </>
      }
    >
      {demoMode && (
        <div className="callout callout-info" style={{ marginBottom: 12, background: '#F5F5F7', border: '1px solid #E5E5EA' }}>
          <Info size={13} style={{ flex: 'none', marginTop: 1, color: '#1D1D1F' }} />
          <span className="t-sm" style={{ color: '#1D1D1F' }}>Using demo Teams — escalation will be recorded but not posted to a real channel.</span>
        </div>
      )}

      {error !== undefined && (
        <div className="callout callout-warn" style={{ marginBottom: 12 }}>
          <AlertTriangle size={13} style={{ flex: 'none', marginTop: 1 }} />
          <span className="t-sm">
            <strong>{escalationErrorHeadline(error)}</strong>
          </span>
        </div>
      )}

      {sent && (
        <div className="callout callout-accent" style={{ marginBottom: 12, background: '#F5F5F7', border: '1px solid #0071E3' }}>
          <Check size={13} style={{ flex: 'none', marginTop: 1, color: '#0071E3' }} />
          <span className="t-sm" style={{ color: '#1D1D1F' }}>Escalation posted successfully.</span>
        </div>
      )}

      <div className="tab-bar" style={{ alignSelf: 'flex-start' }}>
        <button className={cx('tab', mode === 'person' && 'active')} onClick={() => { setMode('person'); setTarget('u7'); }} disabled={sent}>
          Person
        </button>
        <button className={cx('tab', mode === 'channel' && 'active')} onClick={() => { setMode('channel'); setTarget('ch-ops'); }} disabled={sent}>
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
