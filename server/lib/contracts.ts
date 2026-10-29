import { z } from "zod";

import { FINDING_RULES, RUN_MODES, SABOTEUR_PROFILES } from "../../shared/arena-protocol.js";

// Zod contracts shared by action inputs and outputs.

export const rectSchema = z.object({
  x: z.number().describe("Left edge in CSS px, iframe viewport coordinates"),
  y: z.number().describe("Top edge in CSS px, iframe viewport coordinates"),
  w: z.number().describe("Width in CSS px"),
  h: z.number().describe("Height in CSS px"),
});

export const findingSchema = z.object({
  width: z.number().int().describe("Viewport width in px where this was measured"),
  selector: z.string().max(600).describe("CSS selector path of the offending element, relative to #bs-root"),
  rect: rectSchema.describe("Bounding box of the violation (intersection box for collisions)"),
  overflow_px: z.number().describe("Overflow/penetration amount in px; 0 for contrast findings"),
  rule: z.enum(FINDING_RULES).describe("Which measurement rule fired"),
  detail: z.string().max(600).describe("Human-readable measurement summary"),
  otherSelector: z.string().max(600).optional().describe("Second element for collisions and crowding"),
  ratio: z.number().optional().describe("Measured WCAG contrast ratio for contrast findings"),
});

export const saboteurSchema = z.enum(SABOTEUR_PROFILES);
export const runModeSchema = z.enum(RUN_MODES);

export const verdictSchema = z.object({
  width: z.number(),
  pass: z.boolean(),
  failing: z.number(),
  holdout: z.boolean(),
});

export const runSummarySchema = z.object({
  id: z.string(),
  mode: runModeSchema,
  saboteurProfile: z.string(),
  stateHash: z.string(),
  isCurrent: z.boolean(),
  overflowCount: z.number(),
  collisionCount: z.number(),
  contrastFailCount: z.number(),
  publicPassRate: z.number().nullable(),
  holdoutPassRate: z.number().nullable(),
  verdicts: z.array(verdictSchema),
  findings: z.array(findingSchema),
  holdoutFailingLanes: z.number(),
  createdAt: z.string(),
});

export const componentListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  lastPassRate: z.number().nullable(),
  holdoutPassRate: z.number().nullable(),
  saboteurProfile: z.string(),
  revision: z.number(),
  hasAgentDraft: z.boolean(),
  hasHumanEdit: z.boolean(),
  updatedAt: z.string(),
});

export const learnedRuleSchema = z.object({
  id: z.string(),
  extractedInvariant: z.string(),
  unifiedDiff: z.string(),
  skillPath: z.string(),
  createdAt: z.string(),
});

export const stressReportSchema = z.object({
  textNodesTouched: z.number(),
  charsBefore: z.number(),
  charsAfter: z.number(),
  numbersReplaced: z.number(),
  longTokensInjected: z.number(),
  listsEmptied: z.number(),
  optionalDropped: z.number(),
});

export const stageSchema = z.object({
  html: z.string(),
  css: z.string(),
  dir: z.enum(["ltr", "rtl"]),
  lang: z.string(),
  rootFontScale: z.number(),
  stateHash: z.string(),
  report: stressReportSchema,
});
