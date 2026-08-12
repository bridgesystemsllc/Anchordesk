import { closeDb } from '../db/client';
import { migrate } from '../db/migrate';
import { backfillAll } from '../ingest/delta';
import { syncMailboxRegistry } from '../ingest/mailboxes';
import { errFields, log } from '../log';

/**
 * One-time historical pull across every configured mailbox.
 *
 *   npm run ingest:backfill -- 30
 *
 * Run this once after admin consent lands. It also establishes the delta
 * baseline, so the scheduler's reconciliation picks up cleanly from here.
 */
async function main() {
  const days = Number(process.argv[2] ?? 14);
  if (!Number.isFinite(days) || days <= 0 || days > 365) {
    throw new Error(`Invalid day count: ${process.argv[2]}. Expected 1–365.`);
  }

  await migrate();
  const mailboxes = await syncMailboxRegistry();
  log.info('starting backfill', { days, mailboxes: mailboxes.length });

  const stats = await backfillAll(days);
  log.info('backfill finished', stats);
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (e) => {
    log.error('backfill failed', errFields(e));
    await closeDb().catch(() => {});
    process.exit(1);
  });
