-- Anchor Desk · 0006 · Settings & admin — config as data (AD-106)
-- Brand settings, routing rules, Excel bindings, KB source configs, SLA targets,
-- AI settings, and users/roles. Everything that will change is data, not code.

-- cs_brand_settings: display names, signatures, brand voice
CREATE TABLE IF NOT EXISTS cs_brand_settings (
  brand_code     text PRIMARY KEY CHECK (brand_code IN ('CD', 'DB', 'BOC', 'AMBI', 'AF')),
  display_name   text NOT NULL,
  short_name     text NOT NULL,
  signature      text NOT NULL,
  voice          text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed the five brands
INSERT INTO cs_brand_settings (brand_code, display_name, short_name, signature, voice) VALUES
  ('CD', 'Carol''s Daughter', 'Carol''s D.', 'The Carol''s Daughter Care Team', 'Warm, personal, community-minded. Speaks to hair journeys, never clinical.'),
  ('DB', 'Dermablend', 'Dermablend', 'Dermablend Professional Support', 'Clinical, precise, reassuring. Leads with coverage claims and skin safety.'),
  ('BOC', 'Baxter of California', 'Baxter', 'Baxter of California', 'Understated, confident, minimal. Short sentences. No exclamation marks.'),
  ('AMBI', 'Ambi', 'Ambi', 'The Ambi Skincare Team', 'Encouraging and plainspoken. Explains ingredients without jargon.'),
  ('AF', 'AcneFree', 'AcneFree', 'AcneFree Customer Care', 'Direct, practical, upbeat. Regimen-first answers.')
ON CONFLICT DO NOTHING;

-- cs_routing_rules: escalation routing per intent
CREATE TABLE IF NOT EXISTS cs_routing_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent           text NOT NULL CHECK (intent IN ('wismo', 'return', 'refund', 'damage', 'product_q', 'supervisor', 'other')),
  brand_code       text,
  destination_type text NOT NULL CHECK (destination_type IN ('teams_channel', 'user')),
  destination      text NOT NULL,
  label            text NOT NULL,
  enabled          boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_routing_rules_intent_idx ON cs_routing_rules (intent);
CREATE INDEX IF NOT EXISTS cs_routing_rules_brand_idx ON cs_routing_rules (brand_code);

-- cs_excel_bindings: workbook bindings for data export
CREATE TABLE IF NOT EXISTS cs_excel_bindings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  workbook_id     text NOT NULL,
  worksheet       text NOT NULL,
  owner           text NOT NULL,
  columns         text[] NOT NULL DEFAULT '{}',
  auto_append_on  text CHECK (auto_append_on IS NULL OR auto_append_on IN ('wismo', 'return', 'refund', 'damage', 'product_q', 'supervisor', 'other')),
  enabled         boolean NOT NULL DEFAULT true,
  last_write_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cs_excel_bindings_workbook_worksheet_key ON cs_excel_bindings (workbook_id, worksheet);

-- cs_kb_source_configs: knowledge source configuration (not the per-file cs_kb_sources)
CREATE TABLE IF NOT EXISTS cs_kb_source_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('sharepoint', 'fixture')),
  brand_code      text,
  site_id         text,
  drive_id        text,
  item_path       text,
  enabled         boolean NOT NULL DEFAULT true,
  last_indexed_at timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_kb_source_configs_brand_idx ON cs_kb_source_configs (brand_code);

-- cs_sla_targets: SLA first-response targets by priority
CREATE TABLE IF NOT EXISTS cs_sla_targets (
  priority               smallint PRIMARY KEY CHECK (priority >= 1 AND priority <= 4),
  first_response_minutes integer NOT NULL CHECK (first_response_minutes >= 1 AND first_response_minutes <= 10080),
  applies_to             text NOT NULL DEFAULT ''
);

-- Seed defaults: P1=60min, P2=120min, P3=240min, P4=1440min
INSERT INTO cs_sla_targets (priority, first_response_minutes, applies_to) VALUES
  (1, 60, 'VIP, billing disputes, adverse reactions'),
  (2, 120, 'Carrier exceptions, damage, mis-picks'),
  (3, 240, 'Returns, standard WISMO'),
  (4, 1440, 'Product questions, pre-sale')
ON CONFLICT DO NOTHING;

-- cs_ai_settings: singleton AI configuration
CREATE TABLE IF NOT EXISTS cs_ai_settings (
  id                text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  model             text NOT NULL DEFAULT 'claude-sonnet-4-5',
  tone              text NOT NULL DEFAULT 'warm' CHECK (tone IN ('warm', 'clinical', 'understated', 'plainspoken', 'direct')),
  cost_ceiling_usd  numeric(12, 2) NOT NULL DEFAULT 50 CHECK (cost_ceiling_usd >= 0),
  auto_draft        boolean NOT NULL DEFAULT true,
  require_citations boolean NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Insert the singleton row
INSERT INTO cs_ai_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- cs_users: team members and roles
CREATE TABLE IF NOT EXISTS cs_users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  email        text NOT NULL,
  role         text NOT NULL CHECK (role IN ('agent', 'lead', 'admin')),
  title        text NOT NULL DEFAULT '',
  entra_group  text,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cs_users_email_key ON cs_users (lower(email));

-- Seed the seven AGENTS from mock.ts
INSERT INTO cs_users (id, name, email, role, title, enabled) VALUES
  (gen_random_uuid(), 'Ahmad Williams-George', 'ahmad@kareve.com', 'admin', 'Director of Operations', true),
  (gen_random_uuid(), 'Renata Cole', 'renata@kareve.com', 'lead', 'CS Team Lead', true),
  (gen_random_uuid(), 'Miles Okonkwo', 'miles@kareve.com', 'agent', 'Customer Service', true),
  (gen_random_uuid(), 'Priya Raman', 'priya@kareve.com', 'agent', 'Customer Service', true),
  (gen_random_uuid(), 'Devon Park', 'devon@kareve.com', 'agent', 'Customer Service', true),
  (gen_random_uuid(), 'Jared Halstead', 'jared@kareve.com', 'admin', 'IT / Systems', true),
  (gen_random_uuid(), 'Simone Boateng', 'simone@kareve.com', 'lead', 'Fulfillment Manager', true)
ON CONFLICT DO NOTHING;
