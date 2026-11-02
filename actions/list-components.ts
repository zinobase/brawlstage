import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { accessFilter } from "@agent-native/core/sharing";
import { and, desc, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { buildStage, ensureWorkspaceSeed, parseFindings, verdictsFor } from "../server/lib/arena.js";
import { componentListItemSchema } from "../server/lib/contracts.js";

export default defineAction({
  description:
    "List the components in the arena (the fight card) with their latest public 28-width pass rate and sealed holdout pass rate. Seeds three starter components on a workspace's first visit.",
  schema: z.object({}),
  outputSchema: z.object({
    components: z.array(
      componentListItemSchema.extend({
        lanes: z
          .array(z.object({ width: z.number(), pass: z.boolean(), holdout: z.boolean() }))
          .nullable(),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "arena", to: "/arena" }),
    label: "Open the arena",
  }),
  run: async (_args, ctx) => {
    await ensureWorkspaceSeed(ctx);
    const { components, componentShares } = schema;
    const rows = await getDb()
      .select()
      .from(components)
      .where(accessFilter(components, componentShares))
      .orderBy(desc(components.updatedAt))
      .limit(100);
    // Latest run per component, for the fight card's per-lane micro ribbon.
    const ids = rows.map((r) => r.id);
    const owners = [...new Set(rows.map((r) => r.ownerEmail))];
    const runs = ids.length
      ? await getDb()
          .select({
            componentId: schema.viewportRuns.componentId,
            stateHash: schema.viewportRuns.stateHash,
            widthsTestedJson: schema.viewportRuns.widthsTestedJson,
            findingsJson: schema.viewportRuns.findingsJson,
          })
          .from(schema.viewportRuns)
          .where(
            and(
              inArray(schema.viewportRuns.componentId, ids),
              inArray(schema.viewportRuns.ownerEmail, owners),
            ),
          )
          .orderBy(desc(schema.viewportRuns.createdAt))
          .limit(500)
      : [];
    // Only the run that measured the component's current state counts.
    const hashes = new Map(
      await Promise.all(rows.map(async (r) => [r.id, (await buildStage(r)).stateHash] as const)),
    );
    const current = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!current.has(run.componentId) && run.stateHash === hashes.get(run.componentId)) {
        current.set(run.componentId, run);
      }
    }
    return {
      components: rows.map((row) => {
        const run = current.get(row.id);
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          lastPassRate: row.lastPassRate,
          holdoutPassRate: row.holdoutPassRate,
          saboteurProfile: row.saboteurProfile,
          revision: row.revision,
          updatedAt: row.updatedAt,
          hasAgentDraft: row.agentDraftCss !== null,
          hasHumanEdit: row.humanFinalCss !== null,
          lanes: run
            ? verdictsFor(JSON.parse(run.widthsTestedJson) as number[], parseFindings(run.findingsJson)).map(
                (v) => ({ width: v.width, pass: v.pass, holdout: v.holdout }),
              )
            : null,
        };
      }),
    };
  },
});
