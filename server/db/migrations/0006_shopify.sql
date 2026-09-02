-- Shopify order snapshots for customer context (AD-102)
-- Stores immutable snapshots of orders attached to tickets.
-- Re-attaching the same (ticket_id, shopify_order_id) pair returns the existing snapshot.

CREATE TABLE cs_order_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES cs_tickets(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cs_order_snapshots_ticket_order_key ON cs_order_snapshots(ticket_id, shopify_order_id);
CREATE INDEX cs_order_snapshots_ticket_idx ON cs_order_snapshots(ticket_id);
