import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import { desc, eq } from "drizzle-orm";
import { createError } from "h3";

import actionsRegistry from "../../.generated/actions-registry.js";
import { getDb, schema } from "../db/index.js";

const recentDispatchTimes: number[] = [];

function enforceSlidingTurnWindow(meta: { internalContinuation?: boolean; isBackgroundWorker?: boolean }) {
  if (meta.internalContinuation || meta.isBackgroundWorker) return;
  const hourlyCeiling = Number(
    process.env.BRAWLSTAGE_HOURLY_CAP ?? (process.env.VERCEL ? "60" : "0"), // guard:allow-env-credential — sliding-window turn ceiling
  );
  if (!Number.isFinite(hourlyCeiling) || hourlyCeiling <= 0) return;
  const nowMs = Date.now();
  while (recentDispatchTimes.length > 0 && nowMs - (recentDispatchTimes[0] ?? 0) > 60 * 60 * 1000) {
    recentDispatchTimes.shift();
  }
  if (recentDispatchTimes.length >= hourlyCeiling) {
    throw createError({
      statusCode: 429,
      statusMessage: "Arena turn limit reached",
      message: `This hosted stage allows ${hourlyCeiling} corner-agent turns per rolling hour. Manual viewport sweeps, saboteurs, and CSS token surgery remain open.`,
    });
  }
  recentDispatchTimes.push(nowMs);
}

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "list-components",
  "get-component",
  "patch-component-tokens",
  "verify-holdout-widths",
  "inject-saboteur-payload",
  "capture-design-learning",
  "save-component",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "brawlstage",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: {
    connectorCatalog: [],
    appApprovalPage: true,
    keyToolNames: [
      "list-components",
      "get-component",
      "patch-component-tokens",
      "verify-holdout-widths",
      "inject-saboteur-payload",
      "capture-design-learning",
      "save-component",
    ],
  },
  initialToolNames: INITIAL_TOOL_NAMES,
  prepareRequest: (details) => enforceSlidingTurnWindow(details),
  // Layout rules learned from human hand edits ride along with every request,
  // so the agent never has to remember to look them up before patching CSS.
  extraContext: async (_event, owner) => {
    const rules = await getDb()
      .select({ invariant: schema.learnedRules.extractedInvariant })
      .from(schema.learnedRules)
      .where(eq(schema.learnedRules.ownerEmail, owner))
      .orderBy(desc(schema.learnedRules.createdAt))
      .limit(12);
    if (!rules.length) return "<learned-layout-rules>None yet.</learned-layout-rules>";
    return [
      "<learned-layout-rules>",
      "People corrected earlier agent CSS. Follow these in every patch, and say in your reply that you applied a learned rule.",
      ...rules.map((r) => `- ${r.invariant.replace(/\n+/g, " ")}`),
      "</learned-layout-rules>",
    ].join("\n");
  },
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the BrawlStage corner agent. You fix responsive UI components so they survive all 28 public viewport widths and the 5 sealed holdout widths, under adversarial saboteur stress.

The user and you work on the same component. <current-screen> tells you the open component, the active width lane, the selected DOM selector, and the armed saboteur. Use view-screen for the real findings measured at that width.

Every measurement comes from the browser's real DOM engine (getBoundingClientRect, scroll vs client size, AABB intersections, WCAG luminance contrast). Never invent measurements, widths, or pass rates; read them from get-component or view-screen.

Fix loop: read the findings, patch with patch-component-tokens (source "agent"), wait for the open stage to re-measure, then call verify-holdout-widths. AUDIT_PENDING means the sweep has not finished: retry shortly. HOLDOUT_REGRESSION means a sealed width still overflows or collides: fix the general layout (wrapping, fluid tracks, min-width: 0, gap instead of negative margins) — never add media queries targeting specific holdout widths.

Keep the design: never delete a background, a featured or highlighted style, an element or its content to make a check pass. Fix contrast by changing colours (prefer the design tokens), and fix overflow by letting the layout flex.

Before drafting CSS, read .agents/skills/learned-layout-rules/SKILL.md: those rules came from humans correcting earlier agent drafts.

REPLY STYLE: The stage is where your work shows: the width ribbon re-measures after your patch and the holdout card carries the result. So keep the final reply to at most three short sentences: what you did, the one number that matters, and what the human should do next. No headings, no bullet lists and no restating of tool results unless the human asks for detail.`,
});
