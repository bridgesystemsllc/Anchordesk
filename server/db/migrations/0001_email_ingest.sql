-- Anchor Desk · 0001 · email ingest slice of the §5 model.
-- KB chunks, AI runs, escalations, calls and Excel bindings arrive with the
-- features that use them.

CREATE TABLE IF NOT EXISTS cs_mailboxes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_code               text NOT NULL,
  address                  text NOT NULL,
  graph_user_id            text NOT NULL,
  display_name             text NOT NULL,
  enabled                  boolean NOT NULL DEFAULT true,
  subscription_id          text,
  subscription_expires_at  timestamptz,
  client_state             text,
  inbox_delta_link         text,
  sent_delta_link          text,
  last_sync_at             timestamptz,
  last_error_at            timestamptz,
  last_error               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cs_mailboxes_address_key ON cs_mailboxes (lower(address));
CREATE UNIQUE INDEX IF NOT EXISTS cs_mailboxes_brand_key   ON cs_mailboxes (brand_code);
CREATE INDEX        IF NOT EXISTS cs_mailboxes_subscription_idx ON cs_mailboxes (subscription_id);

CREATE TABLE IF NOT EXISTS cs_customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL,
  phone               text,
  name                text,
  shopify_customer_id text,
  lifetime_orders     integer NOT NULL DEFAULT 0,
  lifetime_value      numeric(12,2),
  vip                 boolean NOT NULL DEFAULT false,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- Email is stored lowercased at the boundary, so a plain unique index is the
-- dedup key and citext is not needed.
CREATE UNIQUE INDEX IF NOT EXISTS cs_customers_email_key ON cs_customers (email);

CREATE SEQUENCE IF NOT EXISTS cs_ticket_number_seq START WITH 1000;

CREATE TABLE IF NOT EXISTS cs_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number          integer NOT NULL DEFAULT nextval('cs_ticket_number_seq'),
  brand_id        text NOT NULL,
  subject         text,
  status          text NOT NULL DEFAULT 'new',
  priority        smallint NOT NULL DEFAULT 3,
  channel         text NOT NULL DEFAULT 'email',
  customer_id     uuid REFERENCES cs_customers (id),
  assignee_id     text,
  intent          text,
  sentiment       real,
  order_number    text,
  order_snapshot  jsonb,
  conversation_id text,
  mailbox         text NOT NULL,
  unread          boolean NOT NULL DEFAULT true,
  sla_due_at      timestamptz,
  escalated_to    text,
  escalated_at    timestamptz,
  tags            text[] NOT NULL DEFAULT '{}'::text[],
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  CONSTRAINT cs_tickets_status_chk CHECK (
    status IN ('new','open','pending','escalated','resolved','closed')
  ),
  CONSTRAINT cs_tickets_priority_chk CHECK (priority BETWEEN 1 AND 4)
);
CREATE UNIQUE INDEX IF NOT EXISTS cs_tickets_number_key ON cs_tickets (number);
CREATE INDEX IF NOT EXISTS cs_tickets_status_brand_idx  ON cs_tickets (status, brand_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS cs_tickets_conversation_idx  ON cs_tickets (mailbox, conversation_id);
CREATE INDEX IF NOT EXISTS cs_tickets_order_idx         ON cs_tickets (order_number);
CREATE INDEX IF NOT EXISTS cs_tickets_customer_idx      ON cs_tickets (customer_id);

CREATE TABLE IF NOT EXISTS cs_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           uuid NOT NULL REFERENCES cs_tickets (id) ON DELETE CASCADE,
  graph_message_id    text,
  internet_message_id text,
  direction           text NOT NULL,
  author_email        text,
  author_name         text,
  body_text           text NOT NULL,
  body_html           text,
  has_attachments     boolean NOT NULL DEFAULT false,
  is_draft            boolean NOT NULL DEFAULT false,
  drafted_by_ai       boolean NOT NULL DEFAULT false,
  edited_by_human     boolean NOT NULL DEFAULT false,
  citations           jsonb,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cs_messages_direction_chk CHECK (direction IN ('inbound','outbound'))
);
-- The idempotency guarantee. NULLs are permitted many times over so in-app
-- drafts, which have no Graph id until they are sent, are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS cs_messages_graph_id_key ON cs_messages (graph_message_id);
CREATE INDEX IF NOT EXISTS cs_messages_ticket_idx ON cs_messages (ticket_id, sent_at);
