import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { csMailboxes } from '../db/schema';
import { env } from '../env';
import { log } from '../log';

export type MailboxRow = typeof csMailboxes.$inferSelect;

/**
 * Reconciles the cs_mailboxes table against MAILBOXES config on boot.
 *
 * AD-106: The table is the source of truth at runtime — it carries subscription
 * and delta state, and the Settings UI can change address/graphUserId/displayName/enabled.
 * syncMailboxRegistry only INSERTS missing brands from config; it never overwrites
 * existing address/graphUserId/displayName/enabled so Settings changes persist across restarts.
 */
export async function syncMailboxRegistry(): Promise<MailboxRow[]> {
  const configured = env.MAILBOXES;

  for (const m of configured) {
    const address = m.address.toLowerCase();
    const [existing] = await db
      .select()
      .from(csMailboxes)
      .where(eq(csMailboxes.brandCode, m.brand))
      .limit(1);

    if (!existing) {
      await db.insert(csMailboxes).values({
        brandCode: m.brand,
        address,
        graphUserId: m.userId,
        displayName: m.displayName,
        enabled: true,
      });
      log.info('mailbox registered', { brand: m.brand, address });
    }
  }

  return db.select().from(csMailboxes).where(eq(csMailboxes.enabled, true));
}

export async function enabledMailboxes(): Promise<MailboxRow[]> {
  return db.select().from(csMailboxes).where(eq(csMailboxes.enabled, true));
}

export async function mailboxBySubscription(subscriptionId: string): Promise<MailboxRow | null> {
  const [row] = await db
    .select()
    .from(csMailboxes)
    .where(eq(csMailboxes.subscriptionId, subscriptionId))
    .limit(1);
  return row ?? null;
}
