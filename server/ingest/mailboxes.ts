import { eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '../db/client';
import { csMailboxes } from '../db/schema';
import { env } from '../env';
import { log } from '../log';

export type MailboxRow = typeof csMailboxes.$inferSelect;

/**
 * Reconciles the cs_mailboxes table against MAILBOXES config on boot.
 *
 * The table is the source of truth at runtime — it carries subscription and
 * delta state — but the roster comes from config so adding the sixth brand, or
 * cutting Carol's Daughter over to a new mailbox after the L'Oréal separation,
 * is a config change rather than a schema migration.
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
      continue;
    }

    const addressChanged = existing.address.toLowerCase() !== address;
    if (addressChanged) {
      // A cutover. The old subscription points at the old mailbox and must go,
      // and the delta links are meaningless against a different mailbox.
      log.warn('mailbox address changed — resetting sync state', {
        brand: m.brand,
        from: existing.address,
        to: address,
      });
    }

    await db
      .update(csMailboxes)
      .set({
        address,
        graphUserId: m.userId,
        displayName: m.displayName,
        enabled: true,
        updatedAt: new Date(),
        ...(addressChanged
          ? {
              subscriptionId: null,
              subscriptionExpiresAt: null,
              inboxDeltaLink: null,
              sentDeltaLink: null,
            }
          : {}),
      })
      .where(eq(csMailboxes.id, existing.id));
  }

  const configuredBrands = configured.map((m) => m.brand);
  const disabled = await db
    .update(csMailboxes)
    .set({ enabled: false, subscriptionId: null, updatedAt: new Date() })
    .where(notInArray(csMailboxes.brandCode, configuredBrands))
    .returning({ brandCode: csMailboxes.brandCode });

  for (const row of disabled) {
    log.warn('mailbox disabled — no longer in MAILBOXES config', { brand: row.brandCode });
  }

  return db.select().from(csMailboxes).where(inArray(csMailboxes.brandCode, configuredBrands));
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
