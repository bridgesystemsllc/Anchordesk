-- AD-105: Teams escalation support
-- cs_escalations tracks escalations posted to Teams channels

CREATE TABLE cs_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES cs_tickets(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  teams_message_id text,
  claimed_by text,
  claimed_at timestamptz,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cs_escalations_ticket_idx ON cs_escalations(ticket_id, created_at DESC);
CREATE INDEX cs_escalations_channel_idx ON cs_escalations(channel_id);
