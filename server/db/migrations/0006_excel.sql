-- Excel bindings and appends for runtime workbook integration.
-- Bindings define which sheet to write to; appends track written rows.

CREATE TABLE IF NOT EXISTS cs_excel_bindings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  workbook_id    TEXT,
  worksheet      TEXT NOT NULL,
  owner          TEXT,
  auto_append_on TEXT,
  payload        JSONB NOT NULL DEFAULT '{}',
  enabled        BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cs_excel_bindings_auto_append_idx
  ON cs_excel_bindings (auto_append_on) WHERE auto_append_on IS NOT NULL AND enabled;

CREATE TABLE IF NOT EXISTS cs_excel_appends (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES cs_tickets(id) ON DELETE CASCADE,
  binding_id     UUID NOT NULL REFERENCES cs_excel_bindings(id) ON DELETE CASCADE,
  row_index      INTEGER,
  values         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cs_excel_appends_ticket_binding_key
  ON cs_excel_appends (ticket_id, binding_id);

CREATE INDEX IF NOT EXISTS cs_excel_appends_binding_idx
  ON cs_excel_appends (binding_id, created_at DESC);
