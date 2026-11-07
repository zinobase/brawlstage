import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { defineAction } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ensureWorkspaceSeed, requireUser } from "../server/lib/arena.js";

const LEARNED_RULES_DOC = ".agents/skills/learned-layout-rules/SKILL.md";

export default defineAction({
  description:
    "Reseed the arena fight card back to the initial three components, optionally preserving learned CSS layout rules.",
  schema: z.object({
    preserveRules: z.boolean().optional().describe("Keep learned layout rules across the arena reseed"),
  }),
  outputSchema: z.object({
    fighterCount: z.number(),
    clearedSkillDoc: z.boolean(),
  }),
  agentTool: false,
  uiOnly: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  run: async ({ preserveRules = false }, ctx) => {
    const { ownerEmail } = requireUser(ctx);
    const db = getDb();
    const priorComponents = await db
      .select({ id: schema.components.id, slug: schema.components.slug })
      .from(schema.components)
      .where(eq(schema.components.ownerEmail, ownerEmail));

    const priorIds = priorComponents.map((item) => item.id);
    const oldIdToSlug = new Map(priorComponents.map((item) => [item.id, item.slug]));

    await db.transaction(async (tx) => {
      if (priorIds.length > 0) {
        await tx.delete(schema.componentShares).where(inArray(schema.componentShares.resourceId, priorIds));
      }
      if (!preserveRules) {
        await tx.delete(schema.learnedRules).where(eq(schema.learnedRules.ownerEmail, ownerEmail));
      }
      await tx.delete(schema.viewportRuns).where(eq(schema.viewportRuns.ownerEmail, ownerEmail));
      await tx.delete(schema.chaosCases).where(eq(schema.chaosCases.ownerEmail, ownerEmail));
      await tx.delete(schema.components).where(eq(schema.components.ownerEmail, ownerEmail));
    });

    await ensureWorkspaceSeed(ctx);

    if (preserveRules) {
      const reseeded = await db
        .select({ id: schema.components.id, slug: schema.components.slug })
        .from(schema.components)
        .where(eq(schema.components.ownerEmail, ownerEmail));
      const slugToNewId = new Map(reseeded.map((item) => [item.slug, item.id]));
      for (const [oldId, slug] of oldIdToSlug) {
        const replacementId = slug ? slugToNewId.get(slug) : undefined;
        if (replacementId) {
          await db
            .update(schema.learnedRules)
            .set({ componentId: replacementId })
            .where(and(eq(schema.learnedRules.componentId, oldId), eq(schema.learnedRules.ownerEmail, ownerEmail)));
        }
      }
    }

    let clearedSkillDoc = false;
    if (!preserveRules) {
      try {
        const skillPath = path.join(process.cwd(), LEARNED_RULES_DOC);
        const content = await readFile(skillPath, "utf8");
        const h2Offset = content.indexOf("\n## ");
        if (h2Offset >= 0) {
          await writeFile(skillPath, `${content.slice(0, h2Offset).trimEnd()}\n`, "utf8");
        }
        clearedSkillDoc = true;
      } catch {
        clearedSkillDoc = false;
      }
    }

    const active = await db
      .select({ id: schema.components.id })
      .from(schema.components)
      .where(eq(schema.components.ownerEmail, ownerEmail));
    return { fighterCount: active.length, clearedSkillDoc };
  },
});
