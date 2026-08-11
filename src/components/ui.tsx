import type { ReactNode } from 'react';
import { BRANDS, INTENT_SHORT, STATUS_LABEL, STATUS_TONE } from '@/data/brands';
import type { BrandCode, Intent, TicketStatus } from '@/data/types';
import { cx, initials, slaLabel, slaProgress, slaState } from '@/lib/utils';

export function Badge({
  tone = 'neutral',
  children,
  dot,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={cx('badge', `badge-${tone}`)}>
      {dot && <span className="status-dot" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cx('badge', STATUS_TONE[status])}>
      {status === 'new' && <span className="status-dot live" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function BrandChip({ brand, full }: { brand: BrandCode; full?: boolean }) {
  const b = BRANDS[brand];
  return (
    <span className="brand-chip" style={{ ['--brand-color' as string]: b.color }} title={b.name}>
      {full ? b.name : b.short}
    </span>
  );
}

export function IntentChip({ intent }: { intent: Intent }) {
  return <span className="chip">{INTENT_SHORT[intent]}</span>;
}

export function Avatar({
  name,
  size = 'md',
  muted,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
}) {
  return (
    <span className={cx('avatar', size !== 'md' && size, muted && 'muted')} title={name}>
      {initials(name)}
    </span>
  );
}

/**
 * SLA countdown ring. The single densest signal in the queue: one glance tells
 * you how much of the response window is already spent, and the colour flips
 * to amber at 75% and red on breach.
 */
export function SlaRing({
  createdAt,
  dueAt,
  size = 20,
}: {
  createdAt: string;
  dueAt: string;
  size?: number;
}) {
  const p = slaProgress(createdAt, dueAt);
  const state = slaState(p);
  const stroke = state === 'breach' ? 'var(--danger)' : state === 'warn' ? 'var(--warning)' : 'var(--accent)';
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;

  return (
    <span
      className="row gap-6"
      title={state === 'breach' ? `SLA breached ${slaLabel(dueAt)}` : `${slaLabel(dueAt)} to SLA`}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flex: 'none' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-default)" strokeWidth="2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{
            transition: 'stroke-dashoffset 600ms var(--ease-spring)',
            filter: state === 'breach' ? 'drop-shadow(0 0 4px var(--danger))' : undefined,
          }}
        />
      </svg>
      <span
        className="mono t-xs"
        style={{ color: state === 'ok' ? 'var(--text-tertiary)' : stroke }}
      >
        {slaLabel(dueAt)}
      </span>
    </span>
  );
}

export function Sparkline({
  points,
  width = 62,
  height = 22,
  tone = 'var(--accent)',
}: {
  points: number[];
  width?: number;
  height?: number;
  tone?: string;
}) {
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${height - (v / max) * (height - 3) - 1.5}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="cluster-spark" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={tone}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 400,
          ['--dash' as string]: '400',
          animation: 'drawIn 900ms var(--ease-smooth) both',
        }}
      />
    </svg>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={cx('toggle', on && 'on')}
      onClick={() => onChange(!on)}
    />
  );
}

export function EmptyState({
  glyph,
  title,
  body,
  action,
}: {
  glyph: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state fade-up">
      <div className="empty-glyph">{glyph}</div>
      <div className="empty-title">{title}</div>
      <p className="empty-body">{body}</p>
      {action}
    </div>
  );
}

export function KeyVal({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="kv-key">{k}</span>
      <span className="kv-val">{v}</span>
    </div>
  );
}
