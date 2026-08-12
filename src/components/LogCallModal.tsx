import { useState } from 'react';
import { Phone, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import type { TicketDetail } from '@/data/view';
import { cx } from '@/lib/utils';

const OUTCOMES = [
  ['resolved', 'Resolved'],
  ['callback', 'Callback'],
  ['escalated', 'Escalated'],
  ['no_answer', 'No answer'],
] as const;

/** Path A from §4 — manual logging. Target: under 20 seconds per call. */
export function LogCallModal({ ticket, onClose }: { ticket?: TicketDetail; onClose: () => void }) {
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [outcome, setOutcome] = useState<string>('resolved');
  const [minutes, setMinutes] = useState('4');
  const [notes, setNotes] = useState('');
  const customer = ticket?.customer ?? null;

  return (
    <Modal
      icon={<Phone size={16} />}
      title="Log a call"
      subtitle={ticket ? `Attaching to #${ticket.number}` : 'Not attached to a ticket'}
      onClose={onClose}
      footer={
        <>
          <span className="t-xs t-ter">AI summarizes your notes into the timeline.</span>
          <div className="ml-a row gap-6">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Log call
            </button>
          </div>
        </>
      }
    >
      {customer && (
        <div className="callout callout-accent">
          <Phone size={14} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            <strong>{customer.name}</strong>
            {customer.phone ? ` · ${customer.phone}` : ' · no number on file'}
          </span>
        </div>
      )}

      <div className="row gap-12">
        <div className="form-group grow">
          <label className="form-label">Direction</label>
          <div className="tab-bar">
            <button className={cx('tab', direction === 'inbound' && 'active')} onClick={() => setDirection('inbound')}>
              Inbound
            </button>
            <button className={cx('tab', direction === 'outbound' && 'active')} onClick={() => setDirection('outbound')}>
              Outbound
            </button>
          </div>
        </div>
        <div className="form-group" style={{ width: 108 }}>
          <label className="form-label">Minutes</label>
          <input className="form-input" value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Outcome</label>
        <div className="tab-bar" style={{ alignSelf: 'flex-start' }}>
          {OUTCOMES.map(([k, label]) => (
            <button key={k} className={cx('tab', outcome === k && 'active')} onClick={() => setOutcome(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea
          className="form-textarea"
          placeholder="What was discussed, what you promised, what happens next…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {notes.trim().length > 24 && (
          <p className="form-hint row gap-6" style={{ color: 'var(--accent)' }}>
            <Sparkles size={12} /> A one-line summary will be written to the ticket timeline on save.
          </p>
        )}
      </div>
    </Modal>
  );
}
