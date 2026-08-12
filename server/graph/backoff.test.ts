import { describe, expect, it } from 'vitest';
import { computeDelay, parseRetryAfter } from './backoff';

const NOW = Date.parse('2026-08-11T12:00:00Z');

describe('parseRetryAfter', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfter('12', NOW)).toBe(12_000);
  });

  it('reads an HTTP-date', () => {
    expect(parseRetryAfter('Tue, 11 Aug 2026 12:00:30 GMT', NOW)).toBe(30_000);
  });

  it('treats a date in the past as retry-now rather than a negative wait', () => {
    expect(parseRetryAfter('Tue, 11 Aug 2026 11:59:00 GMT', NOW)).toBe(0);
  });

  it('caps absurd values so one bad header cannot stall ingest for an hour', () => {
    expect(parseRetryAfter('99999', NOW)).toBe(60_000);
  });

  it('returns null for missing or unparseable headers', () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
    expect(parseRetryAfter(undefined, NOW)).toBeNull();
    expect(parseRetryAfter('soon', NOW)).toBeNull();
    expect(parseRetryAfter('', NOW)).toBeNull();
  });
});

describe('computeDelay', () => {
  it('always obeys Retry-After over its own backoff curve', () => {
    // Attempt 4's exponential ceiling is 4s; Graph asking for 2s must win.
    expect(computeDelay(4, '2', () => 1, NOW)).toBe(2000);
  });

  it('grows exponentially when Graph gives no guidance', () => {
    const full = () => 1; // jitter at its maximum, so the ceiling is exact
    expect(computeDelay(1, null, full, NOW)).toBe(500);
    expect(computeDelay(2, null, full, NOW)).toBe(1000);
    expect(computeDelay(3, null, full, NOW)).toBe(2000);
  });

  it('jitters within half the ceiling so workers do not retry in lockstep', () => {
    expect(computeDelay(3, null, () => 0, NOW)).toBe(1000);
    expect(computeDelay(3, null, () => 1, NOW)).toBe(2000);
  });

  it('never exceeds the one-minute cap', () => {
    expect(computeDelay(20, null, () => 1, NOW)).toBe(60_000);
  });
});
