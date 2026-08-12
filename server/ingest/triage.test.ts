import { describe, expect, it } from 'vitest';
import {
  SLA_MINUTES,
  detectIntent,
  detectPriority,
  estimateSentiment,
  extractOrderNumber,
  slaDueAt,
} from './triage';

describe('extractOrderNumber', () => {
  it('finds a prefixed order number', () => {
    expect(extractOrderNumber('Order CD-118402 is late', 'CD')).toBe('CD-118402');
  });

  it("prefers the brand's own prefix over another brand's number in the same text", () => {
    const text = 'My friend ordered CD-118402 but mine is DB-77219';
    expect(extractOrderNumber(text, 'DB')).toBe('DB-77219');
  });

  it('maps BOC to its BX- prefix', () => {
    expect(extractOrderNumber('order BX-44120 never arrived', 'BOC')).toBe('BX-44120');
  });

  it('falls back to a generic hash number', () => {
    expect(extractOrderNumber('Order #1184023 please help')).toBe('1184023');
  });

  it('normalizes case', () => {
    expect(extractOrderNumber('order cd-118402', 'CD')).toBe('CD-118402');
  });

  it('returns null when there is nothing order-shaped', () => {
    expect(extractOrderNumber('Is this safe for colour-treated hair?', 'CD')).toBeNull();
  });

  it('does not mistake a short number for an order', () => {
    expect(extractOrderNumber('I bought 2 of them #42')).toBeNull();
  });
});

describe('detectIntent', () => {
  it('classifies a WISMO', () => {
    expect(
      detectIntent('Where is my order?', "Tracking hasn't moved since the 6th."),
    ).toBe('wismo');
  });

  it('classifies damage', () => {
    expect(detectIntent('Arrived broken', 'The compact was shattered inside the box.')).toBe(
      'damage',
    );
  });

  it('classifies a refund over a return when both are mentioned', () => {
    expect(
      detectIntent('Charged twice', 'I was double charged and want to send it back.'),
    ).toBe('refund');
  });

  it('classifies a return', () => {
    expect(detectIntent('Return request', 'It broke me out, can I send it back?')).toBe('return');
  });

  it('classifies a product question', () => {
    expect(detectIntent('Quick question', 'Is it safe to use while pregnant?')).toBe('product_q');
  });

  it('falls back to other', () => {
    expect(detectIntent('Hello', 'Just saying hi to the team.')).toBe('other');
  });

  it('weights the subject line', () => {
    expect(detectIntent('Damaged on arrival', 'See attached.')).toBe('damage');
  });
});

describe('detectPriority', () => {
  it('jumps to P1 on a supervisor request whatever the intent', () => {
    expect(detectPriority('Question', 'I want to speak to a supervisor.', 'product_q')).toBe(1);
  });

  it('jumps to P1 on an adverse reaction', () => {
    expect(detectPriority('Help', 'I had an allergic reaction and a rash.', 'return')).toBe(1);
  });

  it('jumps to P1 on legal language', () => {
    expect(detectPriority('Final notice', 'My attorney will be in touch.', 'refund')).toBe(1);
  });

  it('uses the intent baseline otherwise', () => {
    expect(detectPriority('Where is it', 'still not here', 'wismo')).toBe(3);
    expect(detectPriority('Broken', 'cracked compact', 'damage')).toBe(2);
    expect(detectPriority('Question', 'which shade', 'product_q')).toBe(4);
  });

  it('bumps a VIP one step but never past P1', () => {
    expect(detectPriority('Where is it', 'still not here', 'wismo', { vip: true })).toBe(2);
    expect(detectPriority('Broken', 'cracked', 'damage', { vip: true })).toBe(1);
    expect(detectPriority('Legal', 'my lawyer', 'refund', { vip: true })).toBe(1);
  });
});

describe('slaDueAt', () => {
  it('applies the per-priority first-reply target', () => {
    const from = new Date('2026-08-11T12:00:00Z');
    expect(slaDueAt(1, from).toISOString()).toBe('2026-08-11T13:00:00.000Z');
    expect(slaDueAt(4, from).toISOString()).toBe('2026-08-12T12:00:00.000Z');
  });

  it('keeps targets ordered by urgency', () => {
    expect(SLA_MINUTES[1]).toBeLessThan(SLA_MINUTES[2]);
    expect(SLA_MINUTES[2]).toBeLessThan(SLA_MINUTES[3]);
    expect(SLA_MINUTES[3]).toBeLessThan(SLA_MINUTES[4]);
  });
});

describe('estimateSentiment', () => {
  it('scores negative language below zero', () => {
    expect(estimateSentiment('This is unacceptable and terrible.')).toBeLessThan(0);
  });

  it('scores gratitude above zero', () => {
    expect(estimateSentiment('Thank you, I love this product.')).toBeGreaterThan(0);
  });

  it('returns neutral for factual text', () => {
    expect(estimateSentiment('Order placed on the second of August.')).toBe(0);
  });

  it('stays within bounds', () => {
    const score = estimateSentiment('awful awful awful terrible worst horrible');
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(1);
  });
});
