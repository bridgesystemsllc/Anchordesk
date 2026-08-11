import { env } from './env';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[env.LOG_LEVEL];

/** Any plain object; the logger JSON-stringifies whatever it is handed. */
export type LogFields = object;

function emit(level: Level, msg: string, fields?: LogFields) {
  if (LEVELS[level] < threshold) return;
  const line = { ts: new Date().toISOString(), level, msg, ...fields };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify(line));
}

/** Never let a secret reach the log stream. */
export function redact(value: string, keep = 4): string {
  if (value.length <= keep) return '***';
  return `${value.slice(0, keep)}***`;
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
};

export function errFields(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    return { error: e.message, stack: e.stack, ...(e.cause ? { cause: String(e.cause) } : {}) };
  }
  return { error: String(e) };
}
