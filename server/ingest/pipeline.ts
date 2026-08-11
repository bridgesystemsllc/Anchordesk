import { normalizeMessage } from './normalize';
import { type StoreOutcome, logOutcome, storeMessage } from './store';
import type { MailboxRow } from './mailboxes';
import { GraphError, graphRequest } from '../graph/client';
import { MESSAGE_SELECT, type GraphMessage } from '../graph/types';
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
