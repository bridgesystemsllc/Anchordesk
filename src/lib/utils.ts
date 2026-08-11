export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "4m" · "2h" · "3d" — dense by design; the queue has no room for prose. */
export function shortAge(from: Date | string, now = new Date()): string {
  const ms = now.getTime() - new Date(from).getTime();
  if (ms < MIN) return 'now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

export function clockTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dayStamp(d: Date | string): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fullStamp(d: Date | string): string {
  return `${dayStamp(d)} · ${clockTime(d)}`;
}

export function usd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function duration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * SLA position as 0→1. 0 = just landed, 1 = breached.
 * Drives the countdown ring on every queue row.
 */
export function slaProgress(createdAt: string, dueAt: string, now = new Date()): number {
  const start = new Date(createdAt).getTime();
  const end = new Date(dueAt).getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export type SlaState = 'ok' | 'warn' | 'breach';

export function slaState(p: number): SlaState {
  if (p >= 1) return 'breach';
  if (p >= 0.75) return 'warn';
  return 'ok';
}

/** Minutes remaining, negative when breached. */
export function slaRemaining(dueAt: string, now = new Date()): number {
  return Math.round((new Date(dueAt).getTime() - now.getTime()) / MIN);
}

export function slaLabel(dueAt: string, now = new Date()): string {
  const m = slaRemaining(dueAt, now);
  const abs = Math.abs(m);
  const text = abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${abs}m`;
  return m < 0 ? `${text} over` : text;
}
