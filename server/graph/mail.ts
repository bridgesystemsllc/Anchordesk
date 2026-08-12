import { GraphError, graphRequest } from './client';
import { MESSAGE_SELECT, type GraphMessage } from './types';
import { errFields, log } from '../log';

/** Outlook category the Desk stamps on mail it has handled. */
export const HANDLED_CATEGORY = 'Anchor Desk';

const user = (id: string) => `/users/${encodeURIComponent(id)}`;
const message = (id: string) => `/messages/${encodeURIComponent(id)}`;

/**
 * Escapes text for an HTML mail body. Agents type plain text; this is the only
 * place it becomes markup, so it is the only place injection could happen.
 */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<div dir="ltr">${paragraphs}</div>`;
}

/**
 * Creates a reply draft against the original message. Graph populates the
 * recipients, subject and quoted history, and assigns the draft its Internet
 * Message-Id — which is what lets us recognise our own mail when Sent Items
 * reconciles it back later.
 */
export async function createReplyDraft(
  mailboxUserId: string,
  inReplyToMessageId: string,
): Promise<GraphMessage> {
  return graphRequest<GraphMessage>(
    `${user(mailboxUserId)}${message(inReplyToMessageId)}/createReply`,
    { method: 'POST', body: {} },
  );
}

export async function updateDraftBody(
  mailboxUserId: string,
  draftId: string,
  html: string,
): Promise<GraphMessage> {
  return graphRequest<GraphMessage>(`${user(mailboxUserId)}${message(draftId)}`, {
    method: 'PATCH',
    body: { body: { contentType: 'HTML', content: html } },
  });
}

/** Sends a draft. Graph answers 202 with no body. */
export async function sendDraft(mailboxUserId: string, draftId: string): Promise<void> {
  await graphRequest<void>(`${user(mailboxUserId)}${message(draftId)}/send`, {
    method: 'POST',
  });
}

/**
 * Finds our sent mail in Sent Items by Message-Id.
 *
 * The send action returns no body, so the sent copy's Graph id is unknown.
 * Resolving it lets us stamp the canonical id onto the message we already
 * wrote, so delta reconciliation later recognises it as already ingested.
 */
export async function findSentByInternetMessageId(
  mailboxUserId: string,
  internetMessageId: string,
): Promise<GraphMessage | null> {
  const filter = encodeURIComponent(`internetMessageId eq '${internetMessageId.replace(/'/g, "''")}'`);
  const page = await graphRequest<{ value?: GraphMessage[] }>(
    `${user(mailboxUserId)}/mailFolders('sentitems')/messages?$filter=${filter}&$select=${MESSAGE_SELECT}&$top=1`,
  );
  return page.value?.[0] ?? null;
}

/**
 * Stamps a category on the original message so anyone still working in the
 * shared mailbox can see the Desk has handled it. Best effort by design —
 * failing to label a message must never fail a reply that already went out.
 */
export async function markHandledInOutlook(
  mailboxUserId: string,
  messageId: string,
): Promise<void> {
  try {
    const existing = await graphRequest<{ categories?: string[] }>(
      `${user(mailboxUserId)}${message(messageId)}?$select=categories`,
    );
    const categories = existing.categories ?? [];
    if (categories.includes(HANDLED_CATEGORY)) return;

    await graphRequest(`${user(mailboxUserId)}${message(messageId)}`, {
      method: 'PATCH',
      body: { categories: [...categories, HANDLED_CATEGORY] },
    });
  } catch (e) {
    if (e instanceof GraphError && e.isNotFound) return;
    log.warn('could not mark message handled in Outlook', { messageId, ...errFields(e) });
  }
}
