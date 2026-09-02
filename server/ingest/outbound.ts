import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { storeMessage } from './store';
import type { NormalizedMessage } from './normalize';
import { db } from '../db/client';
import { csMailboxes, csMessages, csOutboundSends, csTickets } from '../db/schema';
import {
  createReplyDraft,
  findSentByInternetMessageId,
  markHandledInOutlook,
  sendDraft,
  textToHtml,
  updateDraftBody,
} from '../graph/mail';
import { ingestQueue } from '../lib/serial';
import { errFields, log } from '../log';

export type SendOutcome =
  | { status: 'sent'; ticketId: string; messageId: string | null }
  | { status: 'already_sent'; ticketId: string; messageId: string | null }
  | { status: 'in_flight'; ticketId: string };

export class SendError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'ticket_not_found'
      | 'mailbox_unavailable'
      | 'nothing_to_reply_to'
      | 'graph_failed',
  ) {
    super(message);
    this.name = 'SendError';
  }
}

export interface SendReplyInput {
  ticketId: string;
  bodyText: string;
  idempotencyKey: string;
  agentId?: string | null;
  draftedByAi?: boolean;
  editedByHuman?: boolean;
  originalDraft?: string | null;
  citations?: { items: unknown[] } | null;
}

/**
 * Sends a reply on a ticket, at most once per idempotency key.
 *
 * The ordering here is deliberate. The send record is marked 'sent' the moment
 * Graph accepts the message and *before* anything else is written, because
 * every step after that is recoverable and the send itself is not. A crash
 * between the two leaves a ticket briefly missing a timeline entry, which the
 * Sent Items reconciliation repairs. The opposite ordering would risk sending
 * a customer the same reply twice.
 */
export async function sendReply(input: SendReplyInput): Promise<SendOutcome> {
  const { ticketId, bodyText, idempotencyKey } = input;

  const [ticket] = await db.select().from(csTickets).where(eq(csTickets.id, ticketId)).limit(1);
  if (!ticket) throw new SendError('Ticket not found', 'ticket_not_found');

  const [mailbox] = await db
    .select()
    .from(csMailboxes)
    .where(eq(csMailboxes.address, ticket.mailbox))
    .limit(1);
  if (!mailbox || !mailbox.enabled) {
    throw new SendError(
      `No enabled mailbox configured for ${ticket.mailbox}`,
      'mailbox_unavailable',
    );
  }

  // Reply to the most recent inbound message so the thread stays intact.
  const [replyTarget] = await db
    .select({ graphMessageId: csMessages.graphMessageId })
    .from(csMessages)
    .where(
      and(
        eq(csMessages.ticketId, ticketId),
        eq(csMessages.direction, 'inbound'),
        isNotNull(csMessages.graphMessageId),
      ),
    )
    .orderBy(desc(csMessages.sentAt))
    .limit(1);

  if (!replyTarget?.graphMessageId) {
    throw new SendError('No inbound message on this ticket to reply to', 'nothing_to_reply_to');
  }

  const claim = await claimSend({ ...input, inReplyTo: replyTarget.graphMessageId });
  if (claim.kind === 'already_sent') {
    log.info('reply already sent for this idempotency key', { ticketId, idempotencyKey });
    return { status: 'already_sent', ticketId, messageId: claim.messageId };
  }
  if (claim.kind === 'in_flight') {
    log.warn('reply already in flight for this idempotency key', { ticketId, idempotencyKey });
    return { status: 'in_flight', ticketId };
  }

  const sendId = claim.id;
  let draftId: string | undefined;
  let internetMessageId: string | null = null;

  try {
    const draft = await createReplyDraft(mailbox.graphUserId, replyTarget.graphMessageId);
    if (!draft?.id) throw new Error('createReply returned no draft id');
    draftId = draft.id;
    internetMessageId = draft.internetMessageId ?? null;

    await db
      .update(csOutboundSends)
      .set({ draftGraphId: draftId, internetMessageId, updatedAt: new Date() })
      .where(eq(csOutboundSends.id, sendId));

    await updateDraftBody(mailbox.graphUserId, draftId, textToHtml(bodyText));
    await sendDraft(mailbox.graphUserId, draftId);
  } catch (e) {
    await db
      .update(csOutboundSends)
      .set({
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
        updatedAt: new Date(),
      })
      .where(eq(csOutboundSends.id, sendId));

    log.error('reply send failed', { ticketId, idempotencyKey, ...errFields(e) });
    throw new SendError(
      e instanceof Error ? e.message : 'Graph rejected the reply',
      'graph_failed',
    );
  }

  // The point of no return: the customer has the mail. Record that first.
  const sentAt = new Date();
  await db
    .update(csOutboundSends)
    .set({ status: 'sent', sentAt, updatedAt: sentAt })
    .where(eq(csOutboundSends.id, sendId));

  let messageId: string | null = null;
  try {
    const outcome = await storeMessage(
      outboundMessage({ ticket, mailbox, bodyText, draftId, internetMessageId, sentAt }),
    );
    messageId = 'messageId' in outcome ? outcome.messageId : null;

    if (messageId && (input.draftedByAi || input.editedByHuman || input.citations)) {
      const editDiff =
        input.editedByHuman && input.originalDraft
          ? { original: input.originalDraft, sent: bodyText }
          : null;

      await db
        .update(csMessages)
        .set({
          draftedByAi: input.draftedByAi ?? false,
          editedByHuman: input.editedByHuman ?? false,
          citations: input.citations ?? null,
          editDiff,
        })
        .where(eq(csMessages.id, messageId));
    }
  } catch (e) {
    // Recoverable: Sent Items reconciliation will pick the message up.
    log.error('reply sent but not written to the timeline', {
      ticketId,
      draftId,
      ...errFields(e),
    });
  }

  log.info('reply sent', {
    ticket: ticket.number,
    mailbox: mailbox.address,
    idempotencyKey,
  });

  // Off the response path: resolve the sent copy's real id, and label the
  // original in Outlook. Neither affects whether the reply went out.
  void ingestQueue.push(async () => {
    await reconcileSentCopy(sendId, mailbox.graphUserId, internetMessageId);
    await markHandledInOutlook(mailbox.graphUserId, replyTarget.graphMessageId!);
  });

  return { status: 'sent', ticketId, messageId };
}

type ClaimResult =
  | { kind: 'claimed'; id: string }
  | { kind: 'already_sent'; messageId: string | null }
  | { kind: 'in_flight' };

/**
 * Takes ownership of an idempotency key, or reports who already owns it.
 * The unique index does the work — two concurrent requests race to insert and
 * exactly one wins.
 */
async function claimSend(
  input: SendReplyInput & { inReplyTo: string },
): Promise<ClaimResult> {
  const [inserted] = await db
    .insert(csOutboundSends)
    .values({
      idempotencyKey: input.idempotencyKey,
      ticketId: input.ticketId,
      agentId: input.agentId ?? null,
      bodyText: input.bodyText,
      inReplyToGraphId: input.inReplyTo,
      status: 'pending',
      attempts: 1,
    })
    .onConflictDoNothing({ target: csOutboundSends.idempotencyKey })
    .returning({ id: csOutboundSends.id });

  if (inserted) return { kind: 'claimed', id: inserted.id };

  const [existing] = await db
    .select()
    .from(csOutboundSends)
    .where(eq(csOutboundSends.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (!existing) {
    // Vanishingly unlikely: the conflicting row disappeared between the two
    // statements. Treating it as in-flight is the safe read.
    return { kind: 'in_flight' };
  }

  if (existing.status === 'sent') {
    const [message] = existing.draftGraphId
      ? await db
          .select({ id: csMessages.id })
          .from(csMessages)
          .where(eq(csMessages.graphMessageId, existing.draftGraphId))
          .limit(1)
      : [];
    return { kind: 'already_sent', messageId: message?.id ?? null };
  }

  if (existing.status === 'failed') {
    // A previous attempt never reached Graph, so retrying under the same key is
    // safe and is what the agent pressing send again expects.
    await db
      .update(csOutboundSends)
      .set({
        status: 'pending',
        error: null,
        attempts: existing.attempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(csOutboundSends.id, existing.id));
    return { kind: 'claimed', id: existing.id };
  }

  return { kind: 'in_flight' };
}

function outboundMessage(args: {
  ticket: typeof csTickets.$inferSelect;
  mailbox: typeof csMailboxes.$inferSelect;
  bodyText: string;
  draftId: string;
  internetMessageId: string | null;
  sentAt: Date;
}): NormalizedMessage {
  const { ticket, mailbox, bodyText, draftId, internetMessageId, sentAt } = args;

  return {
    // Provisional identity. reconcileSentCopy replaces it with the Sent Items
    // id once Graph exposes one.
    graphMessageId: draftId,
    internetMessageId,
    conversationId: ticket.conversationId ?? `ticket:${ticket.id}`,
    mailbox: mailbox.address,
    brandCode: ticket.brandId,
    direction: 'outbound',
    subject: ticket.subject ?? '(no subject)',
    bodyText,
    bodyHtml: textToHtml(bodyText),
    preview: bodyText.slice(0, 240),
    hasAttachments: false,
    sentAt,
    counterpartyEmail: null,
    counterpartyName: null,
    authorEmail: mailbox.address,
    authorName: mailbox.displayName,
    // Triage describes what the customer wants; our own reply must not restate
    // it, so the ticket's existing classification is carried through untouched.
    intent: (ticket.intent as NormalizedMessage['intent']) ?? 'other',
    priority: (ticket.priority as NormalizedMessage['priority']) ?? 3,
    sentiment: 0,
    orderNumber: ticket.orderNumber,
    slaDueAt: ticket.slaDueAt ?? sentAt,
  };
}

/**
 * Replaces the provisional draft id on our stored message with the id the mail
 * actually has in Sent Items. Without it, delta reconciliation would see an
 * unfamiliar id and fall through to the Message-Id check every pass.
 */
async function reconcileSentCopy(
  sendId: string,
  mailboxUserId: string,
  internetMessageId: string | null,
): Promise<void> {
  if (!internetMessageId) return;

  try {
    const sent = await findSentByInternetMessageId(mailboxUserId, internetMessageId);
    if (!sent?.id) {
      // Exchange may not have filed it yet. The Message-Id index still prevents
      // a duplicate when reconciliation catches up.
      log.debug('sent copy not visible yet', { internetMessageId });
      return;
    }

    await db
      .update(csOutboundSends)
      .set({ sentGraphId: sent.id, updatedAt: new Date() })
      .where(eq(csOutboundSends.id, sendId));

    await db
      .update(csMessages)
      .set({ graphMessageId: sent.id })
      .where(eq(csMessages.internetMessageId, internetMessageId));

    log.debug('sent copy reconciled', { internetMessageId, graphMessageId: sent.id });
  } catch (e) {
    log.warn('could not reconcile sent copy', { internetMessageId, ...errFields(e) });
  }
}
