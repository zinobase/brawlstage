import { sql } from "drizzle-orm";
import { boolean, doublePrecision, integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  createSharesTable,
  ownableColumns,
} from "@agent-native/core/db/schema";

// A component is the shareable resource; runs, chaos cases and learned rules
// carry the same owner/org columns so agent SQL tools stay scoped.

export const components = pgTable("components", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  htmlMarkup: text("html_markup").notNull(),
  cssStyles: text("css_styles").notNull(),
  designTokensJson: text("design_tokens_json").notNull().default("{}"),
  agentDraftCss: text("agent_draft_css"),
  humanFinalCss: text("human_final_css"),
  lastPassRate: doublePrecision("last_pass_rate"),
  holdoutPassRate: doublePrecision("holdout_pass_rate"),
  saboteurProfile: text("saboteur_profile").notNull().default("none"),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
  ...ownableColumns(),
});
export const componentShares = createSharesTable("component_shares");

export const viewportRuns = pgTable("viewport_runs", {
  id: text("id").primaryKey(),
  componentId: text("component_id").notNull(),
  mode: text("mode", { enum: ["public_28", "holdout_5", "full_33"] }).notNull(),
  saboteurProfile: text("saboteur_profile").notNull().default("none"),
  stateHash: text("state_hash").notNull(),
  widthsTestedJson: text("widths_tested_json").notNull(),
  overflowCount: integer("overflow_count").notNull().default(0),
  collisionCount: integer("collision_count").notNull().default(0),
  contrastFailCount: integer("contrast_fail_count").notNull().default(0),
  publicPassRate: doublePrecision("public_pass_rate"),
  holdoutPassRate: doublePrecision("holdout_pass_rate"),
  findingsJson: text("findings_json").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  ...ownableColumns(),
});

export const chaosCases = pgTable("chaos_cases", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mutationType: text("mutation_type", {
    enum: ["i18n-expansion", "rtl-mirror", "payload-extremes", "font-scale-200"],
  }).notNull(),
  transformSpecJson: text("transform_spec_json").notNull(),
  active: boolean("active").notNull().default(true),
  ...ownableColumns(),
});

export const learnedRules = pgTable("learned_rules", {
  id: text("id").primaryKey(),
  componentId: text("component_id").notNull(),
  beforeCss: text("before_css").notNull(),
  afterCss: text("after_css").notNull(),
  unifiedDiff: text("unified_diff").notNull(),
  extractedInvariant: text("extracted_invariant").notNull(),
  skillPath: text("skill_path").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  ...ownableColumns(),
});
