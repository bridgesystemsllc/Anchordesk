-- AI runs table: one row per model call (triage, draft, summarize, policy_check, similar)
-- Never stores email bodies, prompts, completions, or API keys.

CREATE TABLE cs_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES cs_tickets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('triage', 'draft', 'summarize', 'policy_check', 'similar')),
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL,
  ok boolean NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cs_ai_runs_ticket_idx ON cs_ai_runs (ticket_id, created_at DESC);
CREATE INDEX cs_ai_runs_kind_idx ON cs_ai_runs (kind, created_at DESC);

-- Add AI summary and policy hits to tickets
ALTER TABLE cs_tickets ADD COLUMN ai_summary jsonb;
ALTER TABLE cs_tickets ADD COLUMN policy_hits jsonb;

-- Add edit_diff to messages (stores {original, sent} when AI draft is edited before send)
ALTER TABLE cs_messages ADD COLUMN edit_diff jsonb;
