import { closeDb } from '../db/client';
import { migrate } from '../db/migrate';
import { syncMailboxRegistry } from '../ingest/mailboxes';
import { emptyStats, ingestMessage } from '../ingest/pipeline';
import type { GraphMessage } from '../graph/types';
import { errFields, log } from '../log';

/**
 * Development seed. Feeds synthetic Graph messages through the *real* ingest
 * pipeline — normalization, triage, threading, idempotency — rather than
 * inserting rows directly, so what lands in the database is exactly what live
 * mail would produce.
 *
 *   npm run db:seed
 *
 * Safe to re-run: every message carries a stable id, so a second run is a
 * no-op rather than a duplicate.
 */

const MIN = 60_000;
const now = Date.now();
const ago = (m: number) => new Date(now - m * MIN).toISOString();

interface Draft {
  brand: string;
  id: string;
  conversation: string;
  subject: string;
  /** The customer. On an outbound message this is the recipient, not the sender. */
  customer: { name: string; address: string };
  body: string;
  minutesAgo: number;
  outbound?: boolean;
}

const DRAFTS: Draft[] = [
  {
    brand: 'CD',
    id: 'seed-cd-1',
    conversation: 'seed-conv-cd-1',
    subject: 'Order CD-118402 still says in transit after 9 days',
    customer: { name: 'Tanya Whitfield', address: 'tanya.whitfield@gmail.com' },
    body: "<p>Hi — I ordered the Goddess Strength set on the 2nd and tracking hasn't moved since the 6th. It's been sitting in Bolingbrook for almost a week. I've reordered this set three times before and never had an issue. Can you send a replacement? I don't want a refund, I just want the product.</p>",
    minutesAgo: 38,
  },
  {
    brand: 'CD',
    id: 'seed-cd-2',
    conversation: 'seed-conv-cd-1',
    subject: 'RE: Order CD-118402 still says in transit after 9 days',
    customer: { name: 'Tanya Whitfield', address: 'tanya.whitfield@gmail.com' },
    body: "<p>Any update on this? It's been another day.</p><p>On Tue, Aug 11, 2026 at 9:14 AM Care Team wrote:</p><blockquote>quoted history that should not be stored</blockquote>",
    minutesAgo: 12,
  },
  {
    brand: 'DB',
    id: 'seed-db-1',
    conversation: 'seed-conv-db-1',
    subject: 'Cover Care concealer arrived cracked',
    customer: { name: 'Priscilla Nwosu', address: 'p.nwosu@icloud.com' },
    body: '<p>The compact was shattered inside the box — both of them actually. Photos attached. The outer box was fine so I think they were packed loose. Order DB-77219.</p>',
    minutesAgo: 126,
  },
  {
    brand: 'DB',
    id: 'seed-db-2',
    conversation: 'seed-conv-db-1',
    subject: 'RE: Cover Care concealer arrived cracked',
    customer: { name: 'Priscilla Nwosu', address: 'p.nwosu@icloud.com' },
    body: "<p>Hi Priscilla, I'm sorry — that's not how your order should have arrived. Replacements for both compacts go out today.</p>",
    minutesAgo: 40,
    outbound: true,
  },
  {
    brand: 'AF',
    id: 'seed-af-1',
    conversation: 'seed-conv-af-1',
    subject: 'Want to return the 3 Step system — unopened',
    customer: { name: 'Ivy Chen', address: 'ivy.chen@gmail.com' },
    body: '<p>It broke me out worse than before. The box is unopened — I bought it 3 weeks ago. Can I send it back? Order AF-30514.</p>',
    minutesAgo: 214,
  },
  {
    brand: 'AMBI',
    id: 'seed-ambi-1',
    conversation: 'seed-conv-ambi-1',
    subject: 'Charged twice for the same order',
    customer: { name: 'Hannah Lindqvist', address: 'hlindqvist@proton.me' },
    body: '<p>My bank shows two $38.40 charges from Ambi on the same day for order AM-20933. I only placed one order. This is unacceptable — please fix this or I want to speak to a supervisor.</p>',
    minutesAgo: 300,
  },
  {
    brand: 'BOC',
    id: 'seed-boc-1',
    conversation: 'seed-conv-boc-1',
    subject: 'Is Clay Pomade safe for a shaved head?',
    customer: { name: 'Omar Haddad', address: 'omar.haddad@gmail.com' },
    body: '<p>Curious whether the clay will dry out my scalp — I shave my head. Thanks.</p>',
    minutesAgo: 58,
  },
  {
    brand: 'AF',
    id: 'seed-af-2',
    conversation: 'seed-conv-af-2',
    subject: 'Terminator 10 pump not dispensing',
    customer: { name: 'Luis Ortega', address: 'l.ortega@gmail.com' },
    body: '<p>Pump clicks but nothing comes out. This is the second one this month that did it. Order AF-30601.</p>',
    minutesAgo: 72,
  },
];

/**
 * On an inbound message the customer is the sender and the mailbox is the
 * recipient; on an outbound one it is the other way round. Getting this
 * backwards produces a message with no external party, which ingest correctly
 * refuses to store — so the mapping is written once, here.
 */
function toGraphMessage(d: Draft, mailbox: { address: string; displayName: string }): GraphMessage {
  const customer = { name: d.customer.name, address: d.customer.address };
  const desk = { name: mailbox.displayName, address: mailbox.address };
  const [sender, recipient] = d.outbound ? [desk, customer] : [customer, desk];

  return {
    id: d.id,
    conversationId: d.conversation,
    internetMessageId: `<${d.id}@seed.anchordesk>`,
    subject: d.subject,
    from: { emailAddress: sender },
    toRecipients: [{ emailAddress: recipient }],
    receivedDateTime: ago(d.minutesAgo),
    sentDateTime: ago(d.minutesAgo),
    bodyPreview: d.body.replace(/<[^>]+>/g, '').slice(0, 120),
    body: { contentType: 'html', content: d.body },
    isDraft: false,
    hasAttachments: d.id === 'seed-db-1',
  };
}

async function main() {
  await migrate();
  const mailboxes = await syncMailboxRegistry();
  const byBrand = new Map(mailboxes.map((m) => [m.brandCode, m]));

  const stats = emptyStats();
  let skippedNoMailbox = 0;

  for (const draft of DRAFTS) {
    const mailbox = byBrand.get(draft.brand);
    if (!mailbox) {
      skippedNoMailbox++;
      log.warn('no mailbox configured for brand, skipping seed message', { brand: draft.brand });
      continue;
    }

    if (draft.outbound && draft.customer.address.toLowerCase() === mailbox.address.toLowerCase()) {
      throw new Error(
        `Seed draft ${draft.id} is outbound but its customer is the mailbox itself — ` +
          'it would have no external party and be skipped silently.',
      );
    }

    await ingestMessage(toGraphMessage(draft, mailbox), mailbox, stats);
  }

  log.info('seed complete', { ...stats, skippedNoMailbox });

  // Anything skipped here means a malformed draft, not a normal exclusion.
  if (stats.skipped > 0) {
    log.warn('some seed messages were skipped — check the drafts', { skipped: stats.skipped });
  }
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (e) => {
    log.error('seed failed', errFields(e));
    await closeDb().catch(() => {});
    process.exit(1);
  });
