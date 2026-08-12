import { htmlToText, normalizeWhitespace, stripQuotedHistory } from './html';
import {
  type Intent,
  type Priority,
  detectIntent,
  detectPriority,
  estimateSentiment,
  extractOrderNumber,
  slaDueAt,
} from './triage';
import type { GraphMessage } from '../graph/types';

export interface NormalizedMessage {
  graphMessageId: string;
  internetMessageId: string | null;
  conversationId: string;
  mailbox: string;
  brandCode: string;
  direction: 'inbound' | 'outbound';
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  preview: string;
  hasAttachments: boolean;
  sentAt: Date;
  /** The person on the other side of the thread — always the customer. */
  counterpartyEmail: string | null;
  counterpartyName: string | null;
  authorEmail: string | null;
  authorName: string | null;
  intent: Intent;
  priority: Priority;
  sentiment: number;
  orderNumber: string | null;
  slaDueAt: Date;
}

export type NormalizeResult =
  | { ok: true; message: NormalizedMessage }
  | { ok: false; reason: SkipReason };

export type SkipReason =
  | 'deleted'
  | 'draft'
  | 'no-conversation-id'
  | 'no-sender'
  | 'no-counterparty'
  | 'empty-body';

export interface MailboxContext {
  address: string;
  brandCode: string;
}

function addressOf(r: { emailAddress?: { address?: string | null } | null } | null | undefined) {
  const raw = r?.emailAddress?.address;
  return raw ? raw.trim().toLowerCase() : null;
}

function nameOf(r: { emailAddress?: { name?: string | null } | null } | null | undefined) {
  const raw = r?.emailAddress?.name;
  return raw?.trim() || null;
}

/** Prefer Graph's own quoted-history stripping, then our local fallback. */
function extractBody(msg: GraphMessage): { text: string; html: string | null } {
  const html = msg.body?.contentType === 'html' ? (msg.body.content ?? null) : null;

  const unique = msg.uniqueBody?.content?.trim();
  if (unique) {
    const text =
      msg.uniqueBody?.contentType === 'html' ? htmlToText(unique) : normalizeWhitespace(unique);
    if (text) return { text, html };
  }

  const raw = msg.body?.content?.trim();
  if (raw) {
    const text = msg.body?.contentType === 'html' ? htmlToText(raw) : normalizeWhitespace(raw);
    if (text) return { text: stripQuotedHistory(text), html };
  }

  const preview = msg.bodyPreview?.trim();
  return { text: preview ? normalizeWhitespace(preview) : '', html };
}

/**
 * Graph message to the shape ingest stores. Pure — no database, no clock beyond
 * the injected `now`, so every branch is unit-testable.
 */
export function normalizeMessage(
  msg: GraphMessage,
  mailbox: MailboxContext,
  now = new Date(),
): NormalizeResult {
  if (msg['@removed']) return { ok: false, reason: 'deleted' };
  // Drafts are an agent mid-sentence in Outlook, not a customer event.
  if (msg.isDraft) return { ok: false, reason: 'draft' };
  if (!msg.conversationId) return { ok: false, reason: 'no-conversation-id' };

  const mailboxAddress = mailbox.address.trim().toLowerCase();
  const fromAddress = addressOf(msg.from) ?? addressOf(msg.sender);
  // Bounces and system mail arrive with no sender and would otherwise create a
  // ticket with a null customer.
  if (!fromAddress) return { ok: false, reason: 'no-sender' };

  const direction: 'inbound' | 'outbound' = fromAddress === mailboxAddress ? 'outbound' : 'inbound';

  const recipients = msg.toRecipients ?? [];
  const counterparty =
    direction === 'inbound'
      ? { email: fromAddress, name: nameOf(msg.from) ?? nameOf(msg.sender) }
      : (() => {
          const external = recipients.find((r) => {
            const a = addressOf(r);
            return a && a !== mailboxAddress;
          });
          return { email: addressOf(external), name: nameOf(external) };
        })();

  if (!counterparty.email) return { ok: false, reason: 'no-counterparty' };

  const { text, html } = extractBody(msg);
  if (!text) return { ok: false, reason: 'empty-body' };

  const subject = msg.subject?.trim() || '(no subject)';
  const sentAt = new Date(msg.sentDateTime ?? msg.receivedDateTime ?? now.toISOString());
  const timestamp = Number.isNaN(sentAt.getTime()) ? now : sentAt;

  const intent = detectIntent(subject, text);
  const priority = detectPriority(subject, text, intent);

  return {
    ok: true,
    message: {
      graphMessageId: msg.id,
      internetMessageId: msg.internetMessageId?.trim() || null,
      conversationId: msg.conversationId,
      mailbox: mailboxAddress,
      brandCode: mailbox.brandCode,
      direction,
      subject,
      bodyText: text,
      bodyHtml: html,
      preview: (msg.bodyPreview?.trim() || text).slice(0, 240),
      hasAttachments: Boolean(msg.hasAttachments),
      sentAt: timestamp,
      counterpartyEmail: counterparty.email,
      counterpartyName: counterparty.name,
      authorEmail: fromAddress,
      authorName: nameOf(msg.from) ?? nameOf(msg.sender),
      intent,
      priority,
      sentiment: estimateSentiment(text),
      orderNumber: extractOrderNumber(`${subject}\n${text}`, mailbox.brandCode),
      slaDueAt: slaDueAt(priority, timestamp),
    },
  };
}
