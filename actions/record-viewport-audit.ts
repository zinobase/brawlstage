import { defineAction, fail } from "@agent-native/core/action";
import { assertAccess } from "@agent-native/core/sharing";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { HOLDOUT_WIDTHS, widthsForMode } from "../shared/arena-protocol.js";
import { getDb, schema } from "../server/db/index.js";
import { buildStage, loadComponent, nowIso, summarize } from "../server/lib/arena.js";
import { findingSchema, runModeSchema } from "../server/lib/contracts.js";

// Only the browser measurement engine may record runs: the agent cannot submit
// its own "measurements", so a passing gate always reflects real DOM layout.
export default defineAction({
  description:
    "Persist a real DOM measurement sweep (bounding boxes, overflow, AABB collisions, contrast) captured by the arena's iframe engine across the 28 public and/or 5 holdout widths.",
  schema: z.object({
    id: z.string().describe("Component id that was measured"),
    mode: runModeSchema.describe("Which width set was swept: public_28, holdout_5, or full_33"),
    stateHash: z
      .string()
      .length(64)
      .describe("SHA-256 stage hash from get-component that the sweep rendered; stale hashes are rejected"),
    widths: z.array(z.number().int()).max(40).describe("Exact widths measured, in px"),
    findings: z.array(findingSchema).max(4000).describe("Every finding the engine measured"),
  }),
  outputSchema: z.object({
    id: z.string(),
    componentId: z.string(),
    publicPassRate: z.number().nullable(),
    holdoutPassRate: z.number().nullable(),
    overflowCount: z.number(),
    collisionCount: z.number(),
    contrastFailCount: z.number(),
    failingPublicWidths: z.array(z.number()),
    holdoutFailingLanes: z.number(),
  }),
  agentTool: false,
  uiOnly: true,
  changeResource: (input) => ({ resourceType: "component", resourceId: input.id }),
  run: async (args) => {
    await assertAccess("component", args.id, "viewer");
    const component = await loadComponent(args.id);
    const expected = widthsForMode(args.mode);
    const measured = [...args.widths].sort((a, b) => a - b);
    if (measured.length !== expected.length || measured.some((w, i) => w !== expected[i])) {
      fail(`A ${args.mode} sweep must measure exactly ${expected.join(", ")}.`, {
        errorCode: "invalid_width_set",
      });
    }
    if (args.findings.some((f) => !measured.includes(f.width))) {
      fail("Findings reference a width outside the sweep.", { errorCode: "invalid_findings" });
    }
    const stage = await buildStage(component);
    if (stage.stateHash !== args.stateHash) {
      fail("The component changed while it was being measured; re-sweep the current state.", {
        errorCode: "STALE_STATE",
        statusCode: 409,
      });
    }
    const summary = summarize(measured, args.findings);
    const run = {
      id: crypto.randomUUID(),
      componentId: component.id,
      mode: args.mode,
      saboteurProfile: component.saboteurProfile,
      stateHash: stage.stateHash,
      widthsTestedJson: JSON.stringify(measured),
      overflowCount: summary.overflowCount,
      collisionCount: summary.collisionCount,
      contrastFailCount: summary.contrastFailCount,
      publicPassRate: summary.publicPassRate,
      holdoutPassRate: summary.holdoutPassRate,
      findingsJson: JSON.stringify(args.findings),
      createdAt: nowIso(),
      ownerEmail: component.ownerEmail,
      orgId: component.orgId,
      visibility: component.visibility,
    };
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.insert(schema.viewportRuns).values(run);
      await tx
        .update(schema.components)
        .set({
          ...(summary.publicPassRate !== null ? { lastPassRate: summary.publicPassRate } : {}),
          ...(summary.holdoutPassRate !== null ? { holdoutPassRate: summary.holdoutPassRate } : {}),
        })
        .where(
          and(
            eq(schema.components.id, component.id),
            eq(schema.components.ownerEmail, component.ownerEmail),
          ),
        );
    });
    return {
      id: run.id,
      componentId: component.id,
      publicPassRate: summary.publicPassRate,
      holdoutPassRate: summary.holdoutPassRate,
      overflowCount: summary.overflowCount,
      collisionCount: summary.collisionCount,
      contrastFailCount: summary.contrastFailCount,
      failingPublicWidths: summary.verdicts
        .filter((v) => !v.pass && !(HOLDOUT_WIDTHS as readonly number[]).includes(v.width))
        .map((v) => v.width),
      holdoutFailingLanes: summary.verdicts.filter((v) => v.holdout && !v.pass).length,
    };
  },
});
