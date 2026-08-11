import { describe, expect, it } from 'vitest';
import { normalizeMessage } from './normalize';
import type { GraphMessage } from '../graph/types';

const MAILBOX = { address: 'care@carolsdaughter.com', brandCode: 'CD' };
const NOW = new Date('2026-08-11T12:00:00Z');

function message(overrides: Partial<GraphMessage> = {}): GraphMessage {
  return {
    id: 'AAMkAGI1',
    conversationId: 'CONV-1',
    internetMessageId: '<abc@mail.gmail.com>',
    subject: 'Order CD-118402 still in transit',
    from: { emailAddress: { name: 'Tanya Whitfield', address: 'Tanya.Whitfield@Gmail.com' } },
    toRecipients: [{ emailAddress: { address: 'care@carolsdaughter.com' } }],
    receivedDateTime: '2026-08-11T11:40:00Z',
    sentDateTime: '2026-08-11T11:39:00Z',
    bodyPreview: "Tracking hasn't moved since the 6th",
    body: { contentType: 'html', content: "<p>Tracking hasn't moved since the 6th.</p>" },
    isDraft: false,
    hasAttachments: false,
    ...overrides,
  };
}

describe('normalizeMessage — direction and parties', () => {
  it('treats mail from an outsider as inbound and the sender as the customer', () => {
    const result = normalizeMessage(message(), MAILBOX, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.direction).toBe('inbound');
    expect(result.message.counterpartyEmail).toBe('tanya.whitfield@gmail.com');
    expect(result.message.counterpartyName).toBe('Tanya Whitfield');
  });

  it('lowercases addresses so customer dedup works regardless of casing', () => {
    const result = normalizeMessage(message(), MAILBOX, NOW);
    if (!result.ok) throw new Error('expected ok');
    expect(result.message.authorEmail).toBe('tanya.whitfield@gmail.com');
    expect(result.message.mailbox).toBe('care@carolsdaughter.com');
  });

  it('treats mail from the mailbox itself as outbound', () => {
    // This is how an agent replying in Outlook shows up on the ticket — the
    // mitigation for two people working the same thread.
    const result = normalizeMessage(
      message({
        from: { emailAddress: { name: 'Care Team', address: 'care@carolsdaughter.com' } },
        toRecipients: [{ emailAddress: { name: 'Tanya', address: 'tanya.whitfield@gmail.com' } }],
      }),
      MAILBOX,
      NOW,
    );
    if (!result.ok) throw new Error('expected ok');

    expect(result.message.direction).toBe('outbound');
    expect(result.message.counterpartyEmail).toBe('tanya.whitfield@gmail.com');
  });

  it('picks the external recipient when our own address is also on the To line', () => {
    const result = normalizeMessage(
      message({
        from: { emailAddress: { address: 'care@carolsdaughter.com' } },
        toRecipients: [
          { emailAddress: { address: 'care@carolsdaughter.com' } },
          { emailAddress: { address: 'customer@example.com' } },
        ],
      }),
      MAILBOX,
      NOW,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.message.counterpartyEmail).toBe('customer@example.com');
  });
});

describe('normalizeMessage — skips', () => {
  it('skips drafts', () => {
    const result = normalizeMessage(message({ isDraft: true }), MAILBOX, NOW);
    expect(result).toEqual({ ok: false, reason: 'draft' });
  });

  it('skips tombstones from a delta feed', () => {
    const result = normalizeMessage(message({ '@removed': { reason: 'deleted' } }), MAILBOX, NOW);
    expect(result).toEqual({ ok: false, reason: 'deleted' });
  });

  it('skips messages with no conversation id, since threading would be impossible', () => {
    const result = normalizeMessage(message({ conversationId: null }), MAILBOX, NOW);
    expect(result).toEqual({ ok: false, reason: 'no-conversation-id' });
  });

  it('skips bounces and system mail that arrive with no sender', () => {
    const result = normalizeMessage(message({ from: null, sender: null }), MAILBOX, NOW);
    expect(result).toEqual({ ok: false, reason: 'no-sender' });
  });

  it('skips an outbound message with no external recipient', () => {
    const result = normalizeMessage(
      message({
        from: { emailAddress: { address: 'care@carolsdaughter.com' } },
        toRecipients: [{ emailAddress: { address: 'care@carolsdaughter.com' } }],
      }),
      MAILBOX,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'no-counterparty' });
  });

  it('skips a message with no usable body', () => {
    const result = normalizeMessage(
      message({ body: { contentType: 'html', content: '<div></div>' }, bodyPreview: '' }),
      MAILBOX,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'empty-body' });
  });
});

describe('normalizeMessage — body', () => {
  it("prefers Graph's uniqueBody over the full body", () => {
    const result = normalizeMessage(
      message({
        uniqueBody: { contentType: 'html', content: '<p>Just my reply.</p>' },
        body: { contentType: 'html', content: '<p>Just my reply.</p><p>On Mon someone wrote:</p>' },
      }),
      MAILBOX,
      NOW,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.message.bodyText).toBe('Just my reply.');
  });

  it('strips quoted history locally when uniqueBody is absent', () => {
    const result = normalizeMessage(
      message({
        body: {
          contentType: 'text',
          content: 'My reply.\n\nOn Mon, Aug 10, 2026 at 9:14 AM Care Team wrote:\nold',
        },
      }),
      MAILBOX,
      NOW,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.message.bodyText).toBe('My reply.');
  });

  it('keeps the original HTML alongside the extracted text', () => {
    const result = normalizeMessage(message(), MAILBOX, NOW);
    if (!result.ok) throw new Error('expected ok');
    expect(result.message.bodyHtml).toContain('<p>');
    expect(result.message.bodyText).not.toContain('<p>');
  });

  it('falls back to bodyPreview when there is no body content', () => {
    const result = normalizeMessage(
      message({ body: null, uniqueBody: null, bodyPreview: 'Short preview text' }),
      MAILBOX,
      NOW,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.message.bodyText).toBe('Short preview text');
  });
});

describe('normalizeMessage — triage and timing', () => {
  it('carries triage output through', () => {
    const result = normalizeMessage(message(), MAILBOX, NOW);
    if (!result.ok) throw new Error('expected ok');

    expect(result.message.intent).toBe('wismo');
    expect(result.message.orderNumber).toBe('CD-118402');
    expect(result.message.priority).toBe(3);
  });

  it('anchors the SLA to when the mail was sent, not when we ingested it', () => {
    // A backfilled three-day-old email must not read as freshly arrived.
    const result = normalizeMessage(
      message({ sentDateTime: '2026-08-08T09:00:00Z' }),
      MAILBOX,
      NOW,
    );
    if (!result.ok) throw new Error('expected ok');

    expect(result.message.sentAt.toISOString()).toBe('2026-08-08T09:00:00.000Z');
    expect(result.message.slaDueAt.toISOString()).toBe('2026-08-08T13:00:00.000Z');
  });

  it('falls back to receivedDateTime, then to now, for a missing sent time', () => {
    const received = normalizeMessage(message({ sentDateTime: null }), MAILBOX, NOW);
    if (!received.ok) throw new Error('expected ok');
    expect(received.message.sentAt.toISOString()).toBe('2026-08-11T11:40:00.000Z');

    const neither = normalizeMessage(
      message({ sentDateTime: null, receivedDateTime: null }),
      MAILBOX,
      NOW,
    );
    if (!neither.ok) throw new Error('expected ok');
    expect(neither.message.sentAt.toISOString()).toBe(NOW.toISOString());
  });

  it('substitutes a placeholder for a blank subject', () => {
    const result = normalizeMessage(message({ subject: '   ' }), MAILBOX, NOW);
    if (!result.ok) throw new Error('expected ok');
    expect(result.message.subject).toBe('(no subject)');
  });
});
