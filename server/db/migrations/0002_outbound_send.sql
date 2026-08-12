-- Anchor Desk · 0002 · outbound send.
--
-- The whole point of this table is that a customer can never receive the same
-- reply twice: a double-click, a retried request, or a client that lost the
-- response all resolve to one send.

CREATE TABLE IF NOT EXISTS cs_outbound_sends (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Supplied by the client, stable for one composed reply.
  idempotency_key      text NOT NULL,
  ticket_id            uuid NOT NULL REFERENCES cs_tickets (id) ON DELETE CASCADE,
  agent_id             text,
  status               text NOT NULL DEFAULT 'pending',
  -- The inbound message we replied to, so the thread stays intact.
  in_reply_to_graph_id text,
  draft_graph_id       text,
  internet_message_id  text,
  -- Filled in once we locate our own message in Sent Items.
  sent_graph_id        text,
  body_text            text NOT NULL,
  error                text,
  attempts             integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  CONSTRAINT cs_outbound_sends_status_chk CHECK (status IN ('pending','sent','failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS cs_outbound_sends_key
  ON cs_outbound_sends (idempotency_key);
CREATE INDEX IF NOT EXISTS cs_outbound_sends_ticket_idx
  ON cs_outbound_sends (ticket_id, created_at DESC);

-- Second line of defence against a doubled timeline entry. We write our reply
-- immediately using the draft's id, and Sent Items later reconciles the same
-- mail under a different Graph id. The Internet Message-Id survives that
-- transition, so it is what actually identifies "this is the mail we sent".
--
-- Scoped to the ticket rather than global: one customer mail addressed to two
-- brand mailboxes legitimately becomes two tickets carrying one Message-Id.
CREATE UNIQUE INDEX IF NOT EXISTS cs_messages_internet_id_key
  ON cs_messages (ticket_id, internet_message_id)
  WHERE internet_message_id IS NOT NULL;
