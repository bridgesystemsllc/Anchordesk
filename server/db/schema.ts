import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Ingest slice of the §5 model. KB chunks, AI runs, escalations, calls and
 * Excel bindings land with the features that use them — this migration only
 * creates what email ingest needs to run.
 */

/**
 * Mailboxes are rows, not constants (§6.7 build gate). This table also carries
 * per-mailbox Graph sync state: the live subscription, its expiry, and the
 * delta links that let us reconcile without a full re-crawl.
 */
export const csMailboxes = pgTable(
  'cs_mailboxes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandCode: text('brand_code').notNull(),
    address: text('address').notNull(),
    /** What goes in /users/{id} — Entra object id or UPN. */
    graphUserId: text('graph_user_id').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(true),

    subscriptionId: text('subscription_id'),
    subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
    /** Per-mailbox HMAC, compared on every incoming notification. */
    clientState: text('client_state'),

    inboxDeltaLink: text('inbox_delta_link'),
    sentDeltaLink: text('sent_delta_link'),

    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastError: text('last_error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cs_mailboxes_address_key').on(sql`lower(${t.address})`),
    uniqueIndex('cs_mailboxes_brand_key').on(t.brandCode),
    index('cs_mailboxes_subscription_idx').on(t.subscriptionId),
  ],
);

export const csCustomers = pgTable(
  'cs_customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Always stored lowercased; dedup key. */
    email: text('email').notNull(),
    phone: text('phone'),
    name: text('name'),
    shopifyCustomerId: text('shopify_customer_id'),
    lifetimeOrders: integer('lifetime_orders').notNull().default(0),
    lifetimeValue: numeric('lifetime_value', { precision: 12, scale: 2 }),
    vip: boolean('vip').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cs_customers_email_key').on(t.email)],
);

export const csTickets = pgTable(
  'cs_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Assigned by the database sequence, so inserts never specify it.
    number: integer('number')
      .notNull()
      .default(sql`nextval('cs_ticket_number_seq'::regclass)`),
    brandId: text('brand_id').notNull(),
    subject: text('subject'),
    status: text('status').notNull().default('new'),
    priority: smallint('priority').notNull().default(3),
    channel: text('channel').notNull().default('email'),
    customerId: uuid('customer_id').references(() => csCustomers.id),
    assigneeId: text('assignee_id'),
    intent: text('intent'),
    sentiment: real('sentiment'),
    orderNumber: text('order_number'),
    orderSnapshot: jsonb('order_snapshot'),
    /** Graph conversationId — the threading key. */
    conversationId: text('conversation_id'),
    mailbox: text('mailbox').notNull(),
    unread: boolean('unread').notNull().default(true),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    escalatedTo: text('escalated_to'),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('cs_tickets_number_key').on(t.number),
    index('cs_tickets_status_brand_idx').on(t.status, t.brandId, t.updatedAt.desc()),
    index('cs_tickets_conversation_idx').on(t.mailbox, t.conversationId),
    index('cs_tickets_order_idx').on(t.orderNumber),
    index('cs_tickets_customer_idx').on(t.customerId),
  ],
);

export const csMessages = pgTable(
  'cs_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => csTickets.id, { onDelete: 'cascade' }),
    /** Idempotency key — the reason a message can never be ingested twice. */
    graphMessageId: text('graph_message_id'),
    internetMessageId: text('internet_message_id'),
    direction: text('direction').notNull(),
    authorEmail: text('author_email'),
    authorName: text('author_name'),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html'),
    hasAttachments: boolean('has_attachments').notNull().default(false),
    isDraft: boolean('is_draft').notNull().default(false),
    draftedByAi: boolean('drafted_by_ai').notNull().default(false),
    editedByHuman: boolean('edited_by_human').notNull().default(false),
    citations: jsonb('citations'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cs_messages_graph_id_key').on(t.graphMessageId),
    index('cs_messages_ticket_idx').on(t.ticketId, t.sentAt),
  ],
);
