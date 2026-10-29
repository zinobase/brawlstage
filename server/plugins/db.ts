import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "arena-core",
      sql: `CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  html_markup TEXT NOT NULL,
  css_styles TEXT NOT NULL,
  design_tokens_json TEXT NOT NULL DEFAULT '{}',
  agent_draft_css TEXT,
  human_final_css TEXT,
  last_pass_rate DOUBLE PRECISION,
  holdout_pass_rate DOUBLE PRECISION,
  saboteur_profile TEXT NOT NULL DEFAULT 'none',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS component_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (now()),
  notified_at TEXT
);
CREATE TABLE IF NOT EXISTS viewport_runs (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('public_28', 'holdout_5', 'full_33')),
  saboteur_profile TEXT NOT NULL DEFAULT 'none',
  state_hash TEXT NOT NULL,
  widths_tested_json TEXT NOT NULL,
  overflow_count INTEGER NOT NULL DEFAULT 0,
  collision_count INTEGER NOT NULL DEFAULT 0,
  contrast_fail_count INTEGER NOT NULL DEFAULT 0,
  public_pass_rate DOUBLE PRECISION,
  holdout_pass_rate DOUBLE PRECISION,
  findings_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS chaos_cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mutation_type TEXT NOT NULL CHECK (mutation_type IN ('i18n-expansion', 'rtl-mirror', 'payload-extremes', 'font-scale-200')),
  transform_spec_json TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS learned_rules (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  before_css TEXT NOT NULL,
  after_css TEXT NOT NULL,
  unified_diff TEXT NOT NULL,
  extracted_invariant TEXT NOT NULL,
  skill_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE INDEX IF NOT EXISTS components_owner_org_idx ON components (owner_email, org_id, updated_at);
CREATE INDEX IF NOT EXISTS component_shares_resource_idx ON component_shares (resource_id, principal_type, principal_id);
CREATE INDEX IF NOT EXISTS viewport_runs_component_idx ON viewport_runs (component_id, created_at);
CREATE INDEX IF NOT EXISTS chaos_cases_owner_idx ON chaos_cases (owner_email, org_id);
CREATE INDEX IF NOT EXISTS learned_rules_component_idx ON learned_rules (component_id, created_at)`,
    },
  ],
  { table: "brawlstage_migrations" },
);
