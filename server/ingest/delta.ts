import { eq } from 'drizzle-orm';
import { type IngestStats, emptyStats, ingestMessage, mergeStats } from './pipeline';
import type { MailboxRow } from './mailboxes';
import { enabledMailboxes } from './mailboxes';
import { db } from '../db/client';
import { csMailboxes } from '../db/schema';
import { GraphError, graphRequest } from '../graph/client';
import { DELTA_SELECT, type DeltaPage, type GraphMessage } from '../graph/types';
import { errFields, log } from '../log';

export type Folder = 'inbox' | 'sentitems';

const FOLDERS: Folder[] = ['inbox', 'sentitems'];
const PAGE_SIZE = 50;
/** Guard against a pathological nextLink loop pinning the process. */
const MAX_PAGES = 200;

function folderPath(mailbox: MailboxRow, folder: Folder): string {
  return `/users/${encodeURIComponent(mailbox.graphUserId)}/mailFolders('${folder}')`;
}

function storedDeltaLink(mailbox: MailboxRow, folder: Folder): string | null {
  return folder === 'inbox' ? mailbox.inboxDeltaLink : mailbox.sentDeltaLink;
}

async function saveDeltaLink(mailbox: MailboxRow, folder: Folder, link: string | null) {
  await db
    .update(csMailboxes)
    .set({
      ...(folder === 'inbox' ? { inboxDeltaLink: link } : { sentDeltaLink: link }),
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(csMailboxes.id, mailbox.id));
}

/**
 * Walks every page of a message collection, ingesting as it goes, and returns
 * the terminal deltaLink when the collection is a delta feed.
 */
async function drain(
  firstUrl: string,
  mailbox: MailboxRow,
  stats: IngestStats,
  absolute: boolean,
): Promise<string | null> {
  let url: string | undefined = firstUrl;
  let useAbsolute = absolute;
  let pages = 0;

  while (url) {
    if (++pages > MAX_PAGES) {
      log.warn('paging cap reached, stopping', { mailbox: mailbox.address, pages });
      break;
    }

    const page: DeltaPage<GraphMessage> = await graphRequest<DeltaPage<GraphMessage>>(url, {
      absolute: useAbsolute,
    });

    for (const msg of page.value ?? []) {
      await ingestMessage(msg, mailbox, stats);
    }

    if (page['@odata.deltaLink']) return page['@odata.deltaLink'];

    url = page['@odata.nextLink'];
    // nextLink and deltaLink are always absolute URLs.
    useAbsolute = true;
  }

  return null;
}

/**
 * One-time historical pull, bounded by `sinceDays`. Delta cannot express "only
 * the last N days", so the seed uses an ordinary filtered query and delta takes
 * over from the current point in time afterwards.
 */
export async function seedBackfill(
  mailbox: MailboxRow,
  folder: Folder,
  sinceDays: number,
): Promise<IngestStats> {
  const stats = emptyStats();
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60_000).toISOString();
  const filter = encodeURIComponent(`receivedDateTime ge ${since}`);
  // Oldest first, so the message that opened a thread is the one that creates
  // the ticket and later replies append to it.
  const url =
    `${folderPath(mailbox, folder)}/messages` +
    `?$select=${DELTA_SELECT}&$filter=${filter}&$orderby=receivedDateTime%20asc&$top=${PAGE_SIZE}`;

  await drain(url, mailbox, stats, false);
  log.info('backfill complete', { mailbox: mailbox.address, folder, sinceDays, ...stats });
  return stats;
}

/**
 * Establishes a delta baseline without enumerating the whole folder.
 * `$deltatoken=latest` returns a deltaLink for the current state immediately.
 */
export async function initDeltaLink(mailbox: MailboxRow, folder: Folder): Promise<string | null> {
  const page = await graphRequest<DeltaPage<GraphMessage>>(
    `${folderPath(mailbox, folder)}/messages/delta?$deltatoken=latest&$select=${DELTA_SELECT}`,
  );
  const link = page['@odata.deltaLink'] ?? null;
  if (link) await saveDeltaLink(mailbox, folder, link);
  return link;
}

/**
 * The safety net. Webhooks are best-effort: Graph can drop a notification, our
 * endpoint can be briefly down, a subscription can lapse. This closes the gap
 * on an interval, and is the single reason the system cannot silently stop
 * working.
 */
export async function runDelta(mailbox: MailboxRow, folder: Folder): Promise<IngestStats> {
  const stats = emptyStats();
  const link = storedDeltaLink(mailbox, folder);

  if (!link) {
    await initDeltaLink(mailbox, folder);
    log.info('delta baseline established', { mailbox: mailbox.address, folder });
    return stats;
  }

  try {
    const next = await drain(link, mailbox, stats, true);
    if (next) await saveDeltaLink(mailbox, folder, next);
    return stats;
  } catch (e) {
    // 410 Gone means the delta token aged out. Re-seed the recent window so
    // nothing that arrived during the gap is lost, then take a fresh baseline.
    const expired =
      e instanceof GraphError && (e.status === 410 || e.code === 'resyncRequired');
    if (!expired) throw e;

    log.warn('delta token expired, resyncing', { mailbox: mailbox.address, folder });
    await saveDeltaLink(mailbox, folder, null);
    const reseeded = await seedBackfill(mailbox, folder, 2);
    await initDeltaLink(mailbox, folder);
    return mergeStats(stats, reseeded);
  }
}

export async function reconcileMailbox(mailbox: MailboxRow): Promise<IngestStats> {
  let stats = emptyStats();
  for (const folder of FOLDERS) {
    try {
      stats = mergeStats(stats, await runDelta(mailbox, folder));
    } catch (e) {
      stats.failed++;
      await db
        .update(csMailboxes)
        .set({
          lastError: e instanceof Error ? e.message : String(e),
          lastErrorAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(csMailboxes.id, mailbox.id));
      log.error('delta reconciliation failed', {
        mailbox: mailbox.address,
        folder,
        ...errFields(e),
      });
    }
  }
  return stats;
}

export async function reconcileAll(): Promise<IngestStats> {
  const mailboxes = await enabledMailboxes();
  let stats = emptyStats();
  // Sequential on purpose: five mailboxes in parallel is a fast way to meet
  // Graph's per-app throttling limits for no wall-clock gain at this scale.
  for (const mailbox of mailboxes) {
    stats = mergeStats(stats, await reconcileMailbox(mailbox));
  }
  const touched = stats.created + stats.appended;
  if (touched > 0 || stats.failed > 0) log.info('reconciliation pass', stats);
  return stats;
}

export async function backfillAll(sinceDays: number): Promise<IngestStats> {
  const mailboxes = await enabledMailboxes();
  let stats = emptyStats();
  for (const mailbox of mailboxes) {
    for (const folder of FOLDERS) {
      stats = mergeStats(stats, await seedBackfill(mailbox, folder, sinceDays));
    }
    await initDeltaLink(mailbox, 'inbox');
    await initDeltaLink(mailbox, 'sentitems');
  }
  return stats;
}
