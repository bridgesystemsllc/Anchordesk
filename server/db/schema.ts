import {
  bigint,
  boolean,
  customType,
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
 * Custom pgvector type for 1536-dimensional embeddings.
 * Uses text-embedding-3-small from OpenAI.
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    const stripped = value.slice(1, -1);
    return stripped ? stripped.split(',').map(Number) : [];
  },
});

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
    /** AI-generated summary bullets */
    aiSummary: jsonb('ai_summary'),
    /** Policy check hits from the last policy-check call */
    policyHits: jsonb('policy_hits'),
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
    /** Stores {original, sent} when an AI draft is edited before sending */
    editDiff: jsonb('edit_diff'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cs_messages_graph_id_key').on(t.graphMessageId),
    uniqueIndex('cs_messages_internet_id_key').on(t.ticketId, t.internetMessageId),
    index('cs_messages_ticket_idx').on(t.ticketId, t.sentAt),
  ],
);

/**
 * One row per model call. Tracks triage, draft, summarize, policy_check, similar.
 * Never stores email bodies, prompts, completions, or API keys.
 */
export const csAiRuns = pgTable(
  'cs_ai_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => csTickets.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms').notNull(),
    ok: boolean('ok').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cs_ai_runs_ticket_idx').on(t.ticketId, t.createdAt.desc()),
    index('cs_ai_runs_kind_idx').on(t.kind, t.createdAt.desc()),
  ],
);

/**
 * One row per composed reply, keyed by a client-supplied idempotency key.
 * A duplicate reply to a customer is embarrassing; a duplicate refund is worse.
 */
export const csOutboundSends = pgTable(
  'cs_outbound_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idempotencyKey: text('idempotency_key').notNull(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => csTickets.id, { onDelete: 'cascade' }),
    agentId: text('agent_id'),
    status: text('status').notNull().default('pending'),
    inReplyToGraphId: text('in_reply_to_graph_id'),
    draftGraphId: text('draft_graph_id'),
    internetMessageId: text('internet_message_id'),
    sentGraphId: text('sent_graph_id'),
    bodyText: text('body_text').notNull(),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('cs_outbound_sends_key').on(t.idempotencyKey),
    index('cs_outbound_sends_ticket_idx').on(t.ticketId, t.createdAt.desc()),
  ],
);

/**
 * Application settings (singleton row). Stores KB configuration for SharePoint
 * site/drive, and other tenant-wide settings.
 */
export const csSettings = pgTable('cs_settings', {
  id: integer('id').primaryKey().default(1),
  kbSiteId: text('kb_site_id'),
  kbDriveId: text('kb_drive_id'),
  kbFolderPath: text('kb_folder_path').default('/'),
  kbLastCrawlAt: timestamp('kb_last_crawl_at', { withTimezone: true }),
  kbCrawlStatus: text('kb_crawl_status').default('idle'),
  kbCrawlError: text('kb_crawl_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Knowledge base sources (SharePoint documents). Each row is a document that
 * has been crawled and chunked.
 */
export const csKbSources = pgTable(
  'cs_kb_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driveItemId: text('drive_item_id').notNull(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    etag: text('etag'),
    checksum: text('checksum'),
    brandCode: text('brand_code'),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    lastModified: timestamp('last_modified', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cs_kb_sources_drive_item_key').on(t.driveItemId),
    index('cs_kb_sources_brand_idx').on(t.brandCode),
    index('cs_kb_sources_path_idx').on(t.path),
  ],
);

/**
 * Knowledge base chunks (embedded text). Each document is split into chunks
 * with embeddings for vector similarity search.
 */
export const csKbChunks = pgTable(
  'cs_kb_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => csKbSources.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    title: text('title').notNull(),
    text: text('text').notNull(),
    brandCode: text('brand_code'),
    embedding: vector('embedding'),
    tokens: integer('tokens'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cs_kb_chunks_source_idx').on(t.sourceId),
    index('cs_kb_chunks_brand_idx').on(t.brandCode),
  ],
);

/**
 * Ops drill runs. Each POST to /api/health/renewal-drill inserts one row,
 * storing the JSON response payload for audit and debugging.
 */
export const csOpsDrills = pgTable(
  'cs_ops_drills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    ok: boolean('ok').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cs_ops_drills_created_idx').on(t.createdAt.desc())],
);

/**
 * Excel bindings for runtime workbook integration. Each binding defines a
 * target workbook/worksheet and optional auto-append intent trigger.
 * Field map lives in payload.map.
 */
export const csExcelBindings = pgTable(
  'cs_excel_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    workbookId: text('workbook_id'),
    worksheet: text('worksheet').notNull(),
    owner: text('owner'),
    autoAppendOn: text('auto_append_on'),
    payload: jsonb('payload').notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cs_excel_bindings_auto_append_idx')
      .on(t.autoAppendOn)
      .where(sql`${t.autoAppendOn} IS NOT NULL AND ${t.enabled}`),
  ],
);

/**
 * Excel appends track rows written to workbooks. Unique on (ticket_id, binding_id)
 * to prevent duplicate appends for the same ticket and binding.
 */
export const csExcelAppends = pgTable(
  'cs_excel_appends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => csTickets.id, { onDelete: 'cascade' }),
    bindingId: uuid('binding_id')
      .notNull()
      .references(() => csExcelBindings.id, { onDelete: 'cascade' }),
    rowIndex: integer('row_index'),
    values: jsonb('values'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cs_excel_appends_ticket_binding_key').on(t.ticketId, t.bindingId),
    index('cs_excel_appends_binding_idx').on(t.bindingId, t.createdAt.desc()),
  ],
);
