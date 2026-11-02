import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { assertAccess } from "@agent-native/core/sharing";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  buildStage,
  currentOrLatestRun,
  loadComponent,
  parseFindings,
  parseTokens,
  redactHoldout,
  summarize,
} from "../server/lib/arena.js";
import {
  learnedRuleSchema,
  runSummarySchema,
  stageSchema,
} from "../server/lib/contracts.js";

export default defineAction({
  description:
    "Read one component: markup, CSS, design tokens, the stressed stage document for its active saboteur profile, the latest viewport run (public findings only — holdout lanes report pass/fail without detail), chaos cases, and learned layout rules.",
  schema: z.object({
    id: z.string().describe("Component id from list-components"),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    htmlMarkup: z.string(),
    cssStyles: z.string(),
    designTokens: z.record(z.string(), z.string()),
    agentDraftCss: z.string().nullable(),
    humanFinalCss: z.string().nullable(),
    saboteurProfile: z.string(),
    revision: z.number(),
    lastPassRate: z.number().nullable(),
    holdoutPassRate: z.number().nullable(),
    updatedAt: z.string(),
    stage: stageSchema,
    latestRun: runSummarySchema.nullable(),
    chaosCases: z.array(
      z.object({ id: z.string(), name: z.string(), mutationType: z.string(), active: z.boolean() }),
    ),
    learnedRules: z.array(learnedRuleSchema),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "arena",
      to: `/arena/${encodeURIComponent(args.id)}`,
      params: { componentId: args.id },
    }),
    label: "Open in the arena",
  }),
  run: async ({ id }) => {
    await assertAccess("component", id, "viewer");
    const component = await loadComponent(id);
    const stage = await buildStage(component);
    const run = await currentOrLatestRun(component.id, component.ownerEmail, stage.stateHash);
    let latest = null;
    if (run) {
      const widths = JSON.parse(run.widthsTestedJson) as number[];
      const findings = parseFindings(run.findingsJson);
      const summary = summarize(widths, findings);
      latest = {
        id: run.id,
        mode: run.mode,
        saboteurProfile: run.saboteurProfile,
        stateHash: run.stateHash,
        isCurrent: run.stateHash === stage.stateHash,
        overflowCount: run.overflowCount,
        collisionCount: run.collisionCount,
        contrastFailCount: run.contrastFailCount,
        publicPassRate: run.publicPassRate,
        holdoutPassRate: run.holdoutPassRate,
        verdicts: summary.verdicts,
        findings: redactHoldout(findings),
        holdoutFailingLanes: summary.verdicts.filter((v) => v.holdout && !v.pass).length,
        createdAt: run.createdAt,
      };
    }
    const db = getDb();
    const chaos = await db
      .select({
        id: schema.chaosCases.id,
        name: schema.chaosCases.name,
        mutationType: schema.chaosCases.mutationType,
        active: schema.chaosCases.active,
      })
      .from(schema.chaosCases)
      .where(eq(schema.chaosCases.ownerEmail, component.ownerEmail))
      .limit(20);
    const rules = await db
      .select({
        id: schema.learnedRules.id,
        extractedInvariant: schema.learnedRules.extractedInvariant,
        unifiedDiff: schema.learnedRules.unifiedDiff,
        skillPath: schema.learnedRules.skillPath,
        createdAt: schema.learnedRules.createdAt,
      })
      .from(schema.learnedRules)
      .where(
        and(
          eq(schema.learnedRules.componentId, component.id),
          eq(schema.learnedRules.ownerEmail, component.ownerEmail),
        ),
      )
      .orderBy(desc(schema.learnedRules.createdAt))
      .limit(10);
    return {
      id: component.id,
      name: component.name,
      slug: component.slug,
      htmlMarkup: component.htmlMarkup,
      cssStyles: component.cssStyles,
      designTokens: parseTokens(component.designTokensJson),
      agentDraftCss: component.agentDraftCss,
      humanFinalCss: component.humanFinalCss,
      saboteurProfile: component.saboteurProfile,
      revision: component.revision,
      lastPassRate: component.lastPassRate,
      holdoutPassRate: component.holdoutPassRate,
      updatedAt: component.updatedAt,
      stage,
      latestRun: latest,
      chaosCases: chaos,
      learnedRules: rules,
    };
  },
});
