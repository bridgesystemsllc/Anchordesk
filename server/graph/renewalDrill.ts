import { db } from '../db/client';
import { csMailboxes, csOpsDrills } from '../db/schema';
import { eq } from 'drizzle-orm';
import { env } from '../env';
import { log } from '../log';

export interface MailboxDrillResult {
  brand: string;
  address: string;
  action: 'create' | 'renew' | 'skip';
  subscriptionId: string | null;
  expiresAt: string | null;
  reason: string;
}

export interface RenewalDrillResult {
  ok: boolean;
  dryRun: true;
  firedAt: string;
  logEvent: 'renewal_drill_fired';
  mailboxes: MailboxDrillResult[];
  error: string | null;
}

/**
 * Dry-run renewal drill. Evaluates what ensureSubscriptions WOULD do without
 * calling Graph. Decision table mirrors the real renewal logic:
 * - disabled mailboxes: omitted
 * - ENABLE_SUBSCRIPTIONS false: skip "subscriptions disabled"
 * - subscriptionId null: create "no subscription"
 * - expiresAt null: create "no expiry"
 * - expiresAt <= now + SUBSCRIPTION_RENEW_LEAD_MS: renew
 * - else: skip
 *
 * Always inserts one cs_ops_drills row BEFORE returning. Zero Graph HTTP.
 */
export async function runRenewalDrill(): Promise<RenewalDrillResult> {
  const firedAt = new Date().toISOString();
  const mailboxes: MailboxDrillResult[] = [];
  let error: string | null = null;

  try {
    const rows = await db.select().from(csMailboxes).where(eq(csMailboxes.enabled, true));
    const renewBefore = Date.now() + env.SUBSCRIPTION_RENEW_LEAD_MS;

    for (const mailbox of rows) {
      try {
        let action: 'create' | 'renew' | 'skip';
        let reason: string;

        if (!env.ENABLE_SUBSCRIPTIONS) {
          action = 'skip';
          reason = 'subscriptions disabled';
        } else if (!mailbox.subscriptionId) {
          action = 'create';
          reason = 'no subscription';
        } else if (!mailbox.subscriptionExpiresAt) {
          action = 'create';
          reason = 'no expiry';
        } else if (mailbox.subscriptionExpiresAt.getTime() <= renewBefore) {
          action = 'renew';
          reason = `expires within lead time`;
        } else {
          action = 'skip';
          reason = 'subscription healthy';
        }

        mailboxes.push({
          brand: mailbox.brandCode,
          address: mailbox.address,
          action,
          subscriptionId: mailbox.subscriptionId,
          expiresAt: mailbox.subscriptionExpiresAt?.toISOString() ?? null,
          reason,
        });
      } catch (e) {
        error = 'partial';
        break;
      }
    }
  } catch (e) {
    error = 'partial';
  }

  const ok = error === null;
  const result: RenewalDrillResult = {
    ok,
    dryRun: true,
    firedAt,
    logEvent: 'renewal_drill_fired',
    mailboxes,
    error,
  };

  log.info('renewal_drill_fired', { ok, mailboxCount: mailboxes.length, error });

  try {
    await db.insert(csOpsDrills).values({
      kind: 'renewal',
      ok,
      payload: result,
    });
  } catch (e) {
    log.error('renewal_drill_fired', { persistError: true });
    return {
      ...result,
      ok: false,
      error: 'persist',
    };
  }

  return result;
}
