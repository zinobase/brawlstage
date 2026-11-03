import { defineAction, fail } from "@agent-native/core/action";
import { assertAccess } from "@agent-native/core/sharing";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { HOLDOUT_WIDTHS, holdoutRegressions } from "../shared/arena-protocol.js";
import { getDb, schema } from "../server/db/index.js";
import { buildStage, loadComponent, parseFindings, summarize } from "../server/lib/arena.js";

export default defineAction({
  description:
    "Holdout gate. Checks the sealed widths 347, 513, 701, 991 and 1153 px against the latest real measurement of the component's CURRENT state. Fails with HOLDOUT_REGRESSION (409) if any holdout lane has overflow_px > 0 or an AABB collision, and AUDIT_PENDING (409) if the current state has not been measured yet (the open stage re-measures within seconds of a change). Holdout detail is never revealed — fix by improving the general layout, not the specific widths.",
  schema: z.object({
    id: z.string().describe("Component id to gate"),
  }),
  outputSchema: z.object({
    id: z.string(),
    passed: z.literal(true),
    runId: z.string(),
    holdoutWidthsChecked: z.number(),
    holdoutPassRate: z.number().nullable(),
    publicPassRate: z.number().nullable(),
    failingPublicWidths: z.array(z.number()),
    message: z.string(),
    componentName: z.string(),
    publicLanes: z.array(z.object({ width: z.number(), pass: z.boolean() })),
  }),
  // A cleared gate renders as a result card in the app's own chat; a regression stays a 409 error.
  chatUI: { renderer: "brawlstage.holdout-cleared" },
  readOnly: true,
  run: async ({ id }) => {
    await assertAccess("component", id, "viewer");
    const component = await loadComponent(id);
    const stage = await buildStage(component);
    const [run] = await getDb()
      .select()
      .from(schema.viewportRuns)
      .where(
        and(
          eq(schema.viewportRuns.componentId, component.id),
          eq(schema.viewportRuns.ownerEmail, component.ownerEmail),
          eq(schema.viewportRuns.stateHash, stage.stateHash),
          inArray(schema.viewportRuns.mode, ["holdout_5", "full_33"]),
        ),
      )
      .orderBy(desc(schema.viewportRuns.createdAt))
      .limit(1);
    if (!run) {
      fail(
        "The current component state has not been measured at the holdout widths yet. The arena stage re-measures automatically after each change; open /arena/" +
          component.id +
          " and retry in a few seconds.",
        { errorCode: "AUDIT_PENDING", statusCode: 409, details: { stateHash: stage.stateHash } },
      );
    }
    const findings = parseFindings(run.findingsJson);
    const holdout = HOLDOUT_WIDTHS as readonly number[];
    const regressions = holdoutRegressions(findings);
    if (regressions.length) {
      const lanes = new Set(regressions.map((f) => f.width)).size;
      fail("Holdout width regression detected", {
        errorCode: "HOLDOUT_REGRESSION",
        statusCode: 409,
        details: {
          failingHoldoutLanes: lanes,
          holdoutLanes: holdout.length,
          regressionCount: regressions.length,
          publicPassRate: run.publicPassRate,
        },
      });
    }
    const summary = summarize(JSON.parse(run.widthsTestedJson) as number[], findings);
    const failingPublicWidths = summary.verdicts
      .filter((v) => !v.pass && !v.holdout)
      .map((v) => v.width);
    return {
      id: component.id,
      passed: true as const,
      runId: run.id,
      holdoutWidthsChecked: holdout.length,
      holdoutPassRate: run.holdoutPassRate,
      publicPassRate: run.publicPassRate,
      failingPublicWidths,
      message: `All ${holdout.length} sealed holdout widths are free of overflow and collisions.`,
      componentName: component.name,
      publicLanes: summary.verdicts.filter((v) => !v.holdout).map((v) => ({ width: v.width, pass: v.pass })),
    };
  },
});
