import { describe, expect, it } from 'vitest';
import { enforceCitations, parseCitationsJson, type Citation } from './citations';
import type { KbChunk } from './retriever';
import type { OrderContext } from './context';

describe('enforceCitations', () => {
  const chunks: KbChunk[] = [
    { id: 'chunk1', title: 'Return Policy', text: 'Items can be returned within 30 days.', brandCode: 'CD', source: 'kb' },
    { id: 'chunk2', title: 'Shipping Policy', text: 'Free shipping on orders over $50.', brandCode: 'CD', source: 'kb' },
  ];

  const order: OrderContext = {
    number: 'CD-118402',
    placedAt: '2026-08-01',
    fulfillmentStatus: 'in_transit',
    carrier: 'UPS',
    tracking: '1Z999AA10123456784',
  };

  it('passes when all factual sentences are cited', () => {
    const text = 'Your order CD-118402 is in transit with UPS.';
    const citations: Citation[] = [
      { n: 1, label: 'Order number', source: 'order.number', snippet: 'CD-118402', sentence: 'Your order CD-118402 is in transit with UPS.' },
    ];

    const result = enforceCitations(text, citations, { chunks, order });

    expect(result.blocked).toBe(false);
    expect(result.uncited).toHaveLength(0);
  });

  it('blocks when factual sentences lack citations', () => {
    const text = 'Your refund will be processed in 5-7 business days. The return window is 30 days.';
    const citations: Citation[] = [];

    const result = enforceCitations(text, citations, { chunks, order });

    expect(result.blocked).toBe(true);
    expect(result.uncited.length).toBeGreaterThan(0);
  });

  it('allows phatic sentences without citations', () => {
    const text = 'Hi there! Thank you for contacting us. Let me help you.';
    const citations: Citation[] = [];

    const result = enforceCitations(text, citations, { chunks, order: null });

    expect(result.blocked).toBe(false);
    expect(result.uncited).toHaveLength(0);
  });

  it('validates citation sources against available chunks', () => {
    const text = 'Items can be returned within 30 days.';
    const citations: Citation[] = [
      { n: 1, label: 'Return Policy', source: 'chunk:chunk1', snippet: 'within 30 days', sentence: 'Items can be returned within 30 days.' },
    ];

    const result = enforceCitations(text, citations, { chunks, order: null });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.source).toBe('chunk:chunk1');
  });

  it('rejects citations referencing non-existent chunks', () => {
    const text = 'Items can be returned within 30 days.';
    const citations: Citation[] = [
      { n: 1, label: 'Fake Policy', source: 'chunk:nonexistent', snippet: 'fake', sentence: 'Items can be returned within 30 days.' },
    ];

    const result = enforceCitations(text, citations, { chunks, order: null });

    expect(result.items).toHaveLength(0);
    expect(result.blocked).toBe(true);
  });

  it('validates order field citations', () => {
    const text = 'Your tracking number is 1Z999AA10123456784.';
    const citations: Citation[] = [
      { n: 1, label: 'Tracking', source: 'order.tracking', snippet: '1Z999AA10123456784', sentence: 'Your tracking number is 1Z999AA10123456784.' },
    ];

    const result = enforceCitations(text, citations, { chunks: [], order });

    expect(result.items).toHaveLength(1);
    expect(result.blocked).toBe(false);
  });
});

describe('parseCitationsJson', () => {
  it('parses valid citation array', () => {
    const json = [
      { n: 1, label: 'Policy', source: 'chunk:abc', snippet: 'text' },
      { n: 2, label: 'Order', source: 'order.number', snippet: 'CD-123' },
    ];

    const result = parseCitationsJson(json);

    expect(result).toHaveLength(2);
    expect(result[0]!.label).toBe('Policy');
    expect(result[1]!.source).toBe('order.number');
  });

  it('parses citations nested under citations key', () => {
    const json = {
      citations: [
        { n: 1, label: 'Policy', source: 'chunk:abc', snippet: 'text' },
      ],
    };

    const result = parseCitationsJson(json);

    expect(result).toHaveLength(1);
  });

  it('returns empty array for invalid input', () => {
    expect(parseCitationsJson(null)).toEqual([]);
    expect(parseCitationsJson(undefined)).toEqual([]);
    expect(parseCitationsJson('not an object')).toEqual([]);
  });

  it('filters out malformed citations', () => {
    const json = [
      { n: 1, label: 'Valid', source: 'chunk:abc', snippet: 'text' },
      { n: 2, label: 'Missing source' }, // missing source
      { n: 3, source: 'chunk:def', snippet: 'text' }, // missing label
    ];

    const result = parseCitationsJson(json);

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('Valid');
  });
});
