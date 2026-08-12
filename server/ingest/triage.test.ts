import { describe, expect, it } from 'vitest';
import {
  SLA_MINUTES,
  detectIntent,
  detectPriority,
  estimateSentiment,
  extractOrderNumber,
  slaDueAt,
  stripNegatedOutcomes,
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

  it('does not treat a declined outcome as the request', () => {
    // Real wording from a WISMO ticket. Reading this as a refund gets the
    // priority and the escalation route wrong, and answers a question the
    // customer explicitly did not ask.
    expect(
      detectIntent(
        'Order CD-118402 still says in transit after 9 days',
        "Tracking hasn't moved since the 6th. Can you send a replacement? I don't want a refund, I just want the product.",
      ),
    ).toBe('wismo');
  });

  it('handles the curly apostrophe that HTML decoding produces', () => {
    expect(
      detectIntent('Where is my order', "It hasn't arrived. I don’t want a refund, just the item."),
    ).toBe('wismo');
  });

  it('still detects a refund that is actually being asked for', () => {
    expect(detectIntent('Refund please', 'I would like a refund for this order.')).toBe('refund');
    expect(detectIntent('Double charged', 'I was charged twice, please refund one.')).toBe('refund');
  });

  it('classifies a dispenser failure as damage however it is worded', () => {
    // The AF-T10 pump defect never says "defective" — it says this.
    expect(detectIntent('Terminator 10 pump not dispensing', 'Pump clicks but nothing comes out.')).toBe(
      'damage',
    );
  });

  it('classifies a safety question about a named product', () => {
    expect(
      detectIntent('Is Clay Pomade safe for a shaved head?', 'Curious whether the clay will dry out my scalp.'),
    ).toBe('product_q');
  });

  it('classifies usage and duration questions', () => {
    expect(detectIntent('Quick one', 'How often should I apply this?')).toBe('product_q');
    expect(detectIntent('Layering', 'Can I use this with retinol?')).toBe('product_q');
  });
});

describe('stripNegatedOutcomes', () => {
  it('removes the declined outcome and leaves the rest intact', () => {
    const out = stripNegatedOutcomes("I don't want a refund, I just want the product.");
    expect(out).not.toMatch(/refund/i);
    expect(out).toMatch(/just want the product/);
  });

  it('leaves a genuine request untouched', () => {
    expect(stripNegatedOutcomes('Please issue a refund.')).toMatch(/refund/i);
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
