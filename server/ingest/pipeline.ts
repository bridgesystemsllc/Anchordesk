import { normalizeMessage } from './normalize';
import { type StoreOutcome, logOutcome, storeMessage, tryAutoAttachOrder } from './store';
import type { MailboxRow } from './mailboxes';
import { GraphError, graphRequest } from '../graph/client';
import { MESSAGE_SELECT, type GraphMessage } from '../graph/types';
import { applyAiTriage } from '../ai/triage';
import { errFields, log } from '../log';

export interface IngestStats {
  created: number;
  appended: number;
  duplicate: number;
  skipped: number;
  failed: number;
}

export function emptyStats(): IngestStats {
  return { created: 0, appended: 0, duplicate: 0, skipped: 0, failed: 0 };
}

export function mergeStats(a: IngestStats, b: IngestStats): IngestStats {
  return {
    created: a.created + b.created,
    appended: a.appended + b.appended,
    duplicate: a.duplicate + b.duplicate,
    skipped: a.skipped + b.skipped,
    failed: a.failed + b.failed,
  };
}

/** Normalizes and stores one already-fetched Graph message. */
export async function ingestMessage(
  msg: GraphMessage,
  mailbox: MailboxRow,
  stats: IngestStats,
): Promise<StoreOutcome | null> {
  const result = normalizeMessage(msg, {
    address: mailbox.address,
    brandCode: mailbox.brandCode,
  });

  if (!result.ok) {
    stats.skipped++;
    log.debug('message skipped', {
      graphMessageId: msg.id,
      mailbox: mailbox.address,
      reason: result.reason,
    });
    return null;
  }

  const outcome = await storeMessage(result.message);
  logOutcome(outcome, result.message);

  if (outcome.status === 'created') stats.created++;
  else if (outcome.status === 'appended') stats.appended++;
  else stats.duplicate++;

  // Apply AI triage for inbound messages that created or appended to a ticket.
  // Outbound messages and duplicates skip the model. On timeout/error, rule-based values are kept.
  if (
    result.message.direction === 'inbound' &&
    (outcome.status === 'created' || outcome.status === 'appended')
  ) {
    try {
      await applyAiTriage({
        ticketId: outcome.ticketId,
        subject: result.message.subject,
        bodyText: result.message.bodyText,
        brandCode: result.message.brandCode,
        vip: false, // VIP status comes from customer lookup, not available in pipeline
        orderNumberHint: result.message.orderNumber,
        ticketCreatedAt: result.message.sentAt,
      });
    } catch (e) {
      // On timeout/error, rule-based values remain. Log but don't fail ingest.
      log.warn('ai triage failed, keeping rule-based values', {
        ticketId: outcome.ticketId,
        ...errFields(e),
      });
    }
  }

  // Auto-attach Shopify order if this is a new ticket and exactly one order matches.
  // Runs outside the main path so Shopify unavailability cannot block ingest.
  if (outcome.status === 'created' && result.message.counterpartyEmail) {
    void tryAutoAttachOrder(outcome.ticketId, result.message.counterpartyEmail);
  }

  return outcome;
}

/**
 * Fetches and ingests a single message by id — the webhook path. A change
 * notification carries only the id, never the content.
 */
export async function ingestMessageById(
  mailbox: MailboxRow,
  messageId: string,
  stats: IngestStats,
): Promise<void> {
  try {
    const msg = await graphRequest<GraphMessage>(
      `/users/${encodeURIComponent(mailbox.graphUserId)}/messages/${encodeURIComponent(messageId)}?$select=${MESSAGE_SELECT}`,
    );
    await ingestMessage(msg, mailbox, stats);
  } catch (e) {
    // A message deleted between notification and fetch is normal, not an error.
    if (e instanceof GraphError && e.isNotFound) {
      stats.skipped++;
      log.debug('notified message no longer exists', { messageId, mailbox: mailbox.address });
      return;
    }
    stats.failed++;
    log.error('failed to ingest notified message', {
      messageId,
      mailbox: mailbox.address,
      ...errFields(e),
    });
  }
}
