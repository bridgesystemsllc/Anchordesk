-- Ops drill audit log. Each POST to /api/health/renewal-drill inserts one row.
CREATE TABLE IF NOT EXISTS cs_ops_drills (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           TEXT NOT NULL,
  ok             BOOLEAN NOT NULL,
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cs_ops_drills_created_idx ON cs_ops_drills (created_at DESC);
