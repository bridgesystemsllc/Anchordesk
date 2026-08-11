import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { GraphError, graphRequest } from './client';
import type { GraphSubscription } from './types';
import { db } from '../db/client';
import { csMailboxes } from '../db/schema';
import { env } from '../env';
import { errFields, log } from '../log';

/**
 * Outlook message subscriptions max out at 10,080 minutes (under 7 days) —
 * verified against the Graph subscription reference, and longer than the 3 days
 * the spec assumed. We ask for 6 days and renew when under 24 hours remain, so
 * a full day of renewal failures still can't drop the subscription.
 */
export const SUBSCRIPTION_LIFETIME_MS = 6 * 24 * 60 * 60_000;

export const NOTIFICATION_PATH = '/api/graph/notifications';
export const LIFECYCLE_PATH = '/api/graph/lifecycle';

const notificationUrl = () => `${env.PUBLIC_BASE_URL}${NOTIFICATION_PATH}`;
const lifecycleUrl = () => `${env.PUBLIC_BASE_URL}${LIFECYCLE_PATH}`;

/** Deterministic per-mailbox secret, so a renewal keeps the same clientState. */
export function clientStateFor(mailboxId: string): string {
  return createHmac('sha256', env.GRAPH_CLIENT_STATE_SECRET).update(mailboxId).digest('hex');
}

/** Constant-time compare — a plain `===` leaks the secret one byte at a time. */
export function clientStateMatches(expected: string, received: string | undefined | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function resourceFor(graphUserId: string): string {
  // Inbox only. Subscribing to /users/{id}/messages fires for every folder,
  // including Sent and Deleted — sent mail is picked up by delta instead.
  return `/users/${graphUserId}/mailFolders('inbox')/messages`;
}

type MailboxRow = typeof csMailboxes.$inferSelect;

async function createSubscription(mailbox: MailboxRow): Promise<GraphSubscription> {
  const clientState = clientStateFor(mailbox.id);
  const sub = await graphRequest<GraphSubscription>('/subscriptions', {
    method: 'POST',
    body: {
      changeType: 'created',
      notificationUrl: notificationUrl(),
      lifecycleNotificationUrl: lifecycleUrl(),
      resource: resourceFor(mailbox.graphUserId),
      expirationDateTime: new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS).toISOString(),
      clientState,
      latestSupportedTlsVersion: 'v1_2',
    },
  });

  await db
    .update(csMailboxes)
    .set({
      subscriptionId: sub.id,
      subscriptionExpiresAt: new Date(sub.expirationDateTime),
      clientState,
      lastError: null,
      lastErrorAt: null,
      updatedAt: new Date(),
    })
    .where(eq(csMailboxes.id, mailbox.id));

  log.info('graph subscription created', {
    mailbox: mailbox.address,
    subscriptionId: sub.id,
    expiresAt: sub.expirationDateTime,
  });
  return sub;
}

async function renewSubscription(mailbox: MailboxRow): Promise<void> {
  if (!mailbox.subscriptionId) {
    await createSubscription(mailbox);
    return;
  }

  try {
    const sub = await graphRequest<GraphSubscription>(`/subscriptions/${mailbox.subscriptionId}`, {
      method: 'PATCH',
      body: { expirationDateTime: new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS).toISOString() },
    });

    await db
      .update(csMailboxes)
      .set({
        subscriptionExpiresAt: new Date(sub.expirationDateTime),
        lastError: null,
        lastErrorAt: null,
        updatedAt: new Date(),
      })
      .where(eq(csMailboxes.id, mailbox.id));

    log.info('graph subscription renewed', {
      mailbox: mailbox.address,
      subscriptionId: sub.id,
      expiresAt: sub.expirationDateTime,
    });
  } catch (e) {
    // A renewal against a subscription Graph has already dropped 404s. Anything
    // else is a real fault and must surface, not be papered over with a create.
    if (e instanceof GraphError && e.isNotFound) {
      log.warn('subscription gone at renewal, recreating', {
        mailbox: mailbox.address,
        subscriptionId: mailbox.subscriptionId,
      });
      await createSubscription({ ...mailbox, subscriptionId: null });
      return;
    }
    throw e;
  }
}

/**
 * Brings every enabled mailbox to a live subscription. Safe to call repeatedly;
 * this is what the scheduler runs on every tick.
 */
export async function ensureSubscriptions(): Promise<void> {
  const mailboxes = await db.select().from(csMailboxes).where(eq(csMailboxes.enabled, true));
  const renewBefore = Date.now() + env.SUBSCRIPTION_RENEW_LEAD_MS;

  for (const mailbox of mailboxes) {
    try {
      if (!mailbox.subscriptionId) {
        await createSubscription(mailbox);
      } else if (
        !mailbox.subscriptionExpiresAt ||
        mailbox.subscriptionExpiresAt.getTime() <= renewBefore
      ) {
        await renewSubscription(mailbox);
      }
    } catch (e) {
      // One bad mailbox must not stop the other four from being renewed.
      const message = e instanceof Error ? e.message : String(e);
      await db
        .update(csMailboxes)
        .set({ lastError: message, lastErrorAt: new Date(), updatedAt: new Date() })
        .where(eq(csMailboxes.id, mailbox.id));
      log.error('subscription maintenance failed', {
        mailbox: mailbox.address,
        ...errFields(e),
      });
    }
  }
}

/** Handles a `subscriptionRemoved` / `reauthorizationRequired` lifecycle event. */
export async function resubscribe(subscriptionId: string): Promise<void> {
  const [mailbox] = await db
    .select()
    .from(csMailboxes)
    .where(eq(csMailboxes.subscriptionId, subscriptionId))
    .limit(1);

  if (!mailbox) {
    log.warn('lifecycle event for unknown subscription', { subscriptionId });
    return;
  }

  await createSubscription({ ...mailbox, subscriptionId: null });
}

/**
 * Deletes subscriptions pointing at our notification URL that no mailbox row
 * claims. Without this, every redeploy that loses database state leaves Graph
 * pushing to an endpoint nobody is reconciling.
 */
export async function pruneOrphanSubscriptions(): Promise<void> {
  const [{ value: live = [] }, rows] = await Promise.all([
    graphRequest<{ value?: GraphSubscription[] }>('/subscriptions'),
    db.select({ subscriptionId: csMailboxes.subscriptionId }).from(csMailboxes),
  ]);

  const known = new Set(rows.map((r) => r.subscriptionId).filter(Boolean));
  const ours = notificationUrl();

  for (const sub of live) {
    if (sub.notificationUrl !== ours || known.has(sub.id)) continue;
    try {
      await graphRequest(`/subscriptions/${sub.id}`, { method: 'DELETE' });
      log.info('pruned orphan subscription', { subscriptionId: sub.id });
    } catch (e) {
      log.warn('failed to prune orphan subscription', { subscriptionId: sub.id, ...errFields(e) });
    }
  }
}
