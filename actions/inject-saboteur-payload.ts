import { defineAction, fail } from "@agent-native/core/action";
import { assertAccess } from "@agent-native/core/sharing";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { buildStage, syncRatesToState, loadChaosSpec, loadComponent, nowIso } from "../server/lib/arena.js";
import { saboteurSchema, stressReportSchema } from "../server/lib/contracts.js";

export default defineAction({
  description:
    "Arm the Saboteur on a component: applies a deterministic chaos mutation from the workspace chaos library to the component's test stage. Profiles: i18n-expansion (+40% German-style compound text), rtl-mirror (dir=rtl, lang=ar), payload-extremes (120-char unspaced tokens, 0/negative/huge numbers, emptied lists, dropped [data-optional] fields), font-scale-200 (root font-size 200%), or none to disarm. The source markup is never modified.",
  schema: z.object({
    id: z.string().describe("Component id"),
    profile: saboteurSchema.describe(
      "Chaos profile: none | i18n-expansion | rtl-mirror | payload-extremes | font-scale-200",
    ),
  }),
  outputSchema: z.object({
    id: z.string(),
    profile: saboteurSchema,
    chaosCaseId: z.string().nullable(),
    stateHash: z.string(),
    dir: z.enum(["ltr", "rtl"]),
    rootFontScale: z.number(),
    report: stressReportSchema,
  }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  changeResource: (input) => ({ resourceType: "component", resourceId: input.id }),
  run: async ({ id, profile }) => {
    await assertAccess("component", id, "editor");
    const component = await loadComponent(id);
    const chaos = await loadChaosSpec(component.ownerEmail, profile);
    if (profile !== "none" && !chaos) {
      fail(`No active chaos case for ${profile} in this workspace.`, {
        errorCode: "chaos_case_missing",
        statusCode: 404,
      });
    }
    const [updated] = await getDb()
      .update(schema.components)
      .set({ saboteurProfile: profile, updatedAt: nowIso() })
      .where(
        and(
          eq(schema.components.id, component.id),
          eq(schema.components.ownerEmail, component.ownerEmail),
        ),
      )
      .returning();
    if (!updated) fail("Component not found.", { errorCode: "not_found", statusCode: 404 });
    const stage = await buildStage(updated);
    await syncRatesToState(updated, stage.stateHash);
    return {
      id: updated.id,
      profile,
      chaosCaseId: chaos?.id ?? null,
      stateHash: stage.stateHash,
      dir: stage.dir,
      rootFontScale: stage.rootFontScale,
      report: stage.report,
    };
  },
});
