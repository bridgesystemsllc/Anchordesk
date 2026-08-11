import { Router, type Request, type Response } from 'express';
import { clientStateMatches } from '../graph/subscriptions';
import { resubscribe } from '../graph/subscriptions';
import { reconcileMailbox } from '../ingest/delta';
import { mailboxBySubscription } from '../ingest/mailboxes';
import { emptyStats, ingestMessageById } from '../ingest/pipeline';
import { ingestQueue } from '../lib/serial';
import { errFields, log } from '../log';
import type { ChangeNotification, ChangeNotificationCollection } from '../graph/types';

export const notificationsRouter = Router();

/**
 * Graph validates a notificationUrl by POSTing with a `validationToken` query
 * parameter and expects the decoded token echoed back as text/plain within 10
 * seconds. It arrives before any subscription exists, so it must be answered
 * before authentication, body parsing, or any lookup.
 */
function handleValidation(req: Request, res: Response): boolean {
  const token = req.query.validationToken;
  if (typeof token !== 'string') return false;
  res.status(200).type('text/plain').send(token);
  return true;
}

/** Extracts the message id from a notification's resource path or resourceData. */
export function messageIdFrom(notification: ChangeNotification): string | null {
  const fromData = notification.resourceData?.id;
  if (fromData) return fromData;

  // Fallback: Graph sends the path capitalized — Users/{id}/Messages('AAMkAD...')
  const match = /\/messages\(['"]?([^'")]+)['"]?\)/i.exec(notification.resource ?? '');
  return match?.[1] ?? null;
}

notificationsRouter.post('/notifications', (req, res) => {
  if (handleValidation(req, res)) return;

  const payload = req.body as ChangeNotificationCollection | undefined;
  const notifications = payload?.value ?? [];

  // Graph retries anything not acknowledged within ~3 seconds, and a retry
  // storm is worse than a slow ingest. Acknowledge first, work afterwards.
  res.status(202).end();

  if (notifications.length === 0) return;

  void ingestQueue.push(() => processNotifications(notifications));
});

async function processNotifications(notifications: ChangeNotification[]): Promise<void> {
  // One Graph fetch per message; group so each subscription is resolved once.
  const bySubscription = new Map<string, ChangeNotification[]>();
  for (const n of notifications) {
    if (!n.subscriptionId) continue;
    const list = bySubscription.get(n.subscriptionId) ?? [];
    list.push(n);
    bySubscription.set(n.subscriptionId, list);
  }

  for (const [subscriptionId, group] of bySubscription) {
    try {
      const mailbox = await mailboxBySubscription(subscriptionId);
      if (!mailbox) {
        log.warn('notification for unknown subscription', { subscriptionId });
        continue;
      }

      // Anyone can POST to a public webhook. clientState is what proves the
      // payload came from Graph for this specific mailbox.
      const valid = group.filter((n) => clientStateMatches(mailbox.clientState ?? '', n.clientState));
      if (valid.length !== group.length) {
        log.warn('rejected notifications with bad clientState', {
          subscriptionId,
          mailbox: mailbox.address,
          rejected: group.length - valid.length,
        });
      }
      if (valid.length === 0) continue;

      const stats = emptyStats();
      const seen = new Set<string>();

      for (const notification of valid) {
        const messageId = messageIdFrom(notification);
        if (!messageId || seen.has(messageId)) continue;
        seen.add(messageId);
        await ingestMessageById(mailbox, messageId, stats);
      }

      log.debug('notification batch processed', {
        mailbox: mailbox.address,
        count: seen.size,
        ...stats,
      });
    } catch (e) {
      log.error('notification batch failed', { subscriptionId, ...errFields(e) });
    }
  }
}

/**
 * Lifecycle notifications. These are the difference between a subscription
 * quietly dying and the system noticing. `missed` in particular means Graph
 * knows it dropped notifications for us — the correct response is an immediate
 * delta pass, not a wait for the next timer.
 */
notificationsRouter.post('/lifecycle', (req, res) => {
  if (handleValidation(req, res)) return;

  const payload = req.body as ChangeNotificationCollection | undefined;
  const notifications = payload?.value ?? [];
  res.status(202).end();

  if (notifications.length === 0) return;

  void ingestQueue.push(async () => {
    for (const n of notifications) {
      const subscriptionId = n.subscriptionId;
      if (!subscriptionId) continue;

      const mailbox = await mailboxBySubscription(subscriptionId);
      if (mailbox && !clientStateMatches(mailbox.clientState ?? '', n.clientState)) {
        log.warn('rejected lifecycle event with bad clientState', { subscriptionId });
        continue;
      }

      log.warn('graph lifecycle event', {
        event: n.lifecycleEvent,
        subscriptionId,
        mailbox: mailbox?.address,
      });

      try {
        switch (n.lifecycleEvent) {
          case 'reauthorizationRequired':
          case 'subscriptionRemoved':
            await resubscribe(subscriptionId);
            if (mailbox) await reconcileMailbox(mailbox);
            break;
          case 'missed':
            // Graph is telling us it dropped notifications. Close the gap now.
            if (mailbox) await reconcileMailbox(mailbox);
            break;
          default:
            log.warn('unhandled lifecycle event', { event: n.lifecycleEvent, subscriptionId });
        }
      } catch (e) {
        log.error('lifecycle handling failed', {
          subscriptionId,
          event: n.lifecycleEvent,
          ...errFields(e),
        });
      }
    }
  });
});
