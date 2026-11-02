import { defineAction, fail } from "@agent-native/core/action";
import { assertAccess } from "@agent-native/core/sharing";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  buildStage,
  syncRatesToState,
  effectiveCss,
  loadComponent,
  nowIso,
  parseTokens,
  validateTokens,
} from "../server/lib/arena.js";

export default defineAction({
  description:
    "Surgically patch a component's design tokens and/or CSS rules. Records who made the change: source \"agent\" stores the result as the agent draft, source \"human\" stores it as the human final, which capture-design-learning diffs later. The open arena stage re-measures all 33 widths automatically; then call verify-holdout-widths.",
  schema: z.object({
    id: z.string().describe("Component id"),
    source: z
      .enum(["agent", "human"])
      .describe("Who authored this patch: \"agent\" when the AI agent edits, \"human\" for direct manipulation in the UI"),
    tokens: z
      .record(z.string(), z.string().nullable())
      .optional()
      .describe("Token updates as CSS custom properties, e.g. {\"--space-gap\": \"12px\"}; null removes a token"),
    css: z
      .string()
      .max(60000)
      .optional()
      .describe("Full replacement CSS for the component; omit to keep the current CSS"),
    edits: z
      .array(
        z.object({
          find: z.string().min(1).describe("Exact CSS text to find; must occur exactly once"),
          replace: z.string().describe("Replacement CSS text"),
        }),
      )
      .max(20)
      .optional()
      .describe("Find/replace edits applied in order to the CSS (after `css` if both are given)"),
  }),
  outputSchema: z.object({
    id: z.string(),
    source: z.enum(["agent", "human"]),
    revision: z.number(),
    changedTokens: z.array(z.string()),
    cssChanged: z.boolean(),
    stateHash: z.string(),
    nextRequiredAction: z.string(),
  }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  changeResource: (input) => ({ resourceType: "component", resourceId: input.id }),
  run: async (args) => {
    await assertAccess("component", args.id, "editor");
    const component = await loadComponent(args.id);
    if (!args.tokens && args.css === undefined && !args.edits?.length) {
      fail("Nothing to patch: pass tokens, css, or edits.", { errorCode: "empty_patch" });
    }
    const tokens = parseTokens(component.designTokensJson);
    const changedTokens: string[] = [];
    for (const [name, value] of Object.entries(args.tokens ?? {})) {
      if (value === null) {
        if (name in tokens) {
          delete tokens[name];
          changedTokens.push(name);
        }
      } else if (tokens[name] !== value.trim()) {
        tokens[name] = value.trim();
        changedTokens.push(name);
      }
    }
    validateTokens(tokens);
    let css = args.css ?? component.cssStyles;
    for (const edit of args.edits ?? []) {
      const first = css.indexOf(edit.find);
      if (first < 0) {
        fail(`Edit target not found in CSS: ${edit.find.slice(0, 80)}`, { errorCode: "edit_not_found" });
      }
      if (css.indexOf(edit.find, first + edit.find.length) >= 0) {
        fail(`Edit target occurs more than once; include more context: ${edit.find.slice(0, 80)}`, {
          errorCode: "edit_ambiguous",
        });
      }
      css = css.slice(0, first) + edit.replace + css.slice(first + edit.find.length);
    }
    const cssChanged = css !== component.cssStyles;
    if (!cssChanged && !changedTokens.length) {
      fail("Patch produced no change.", { errorCode: "no_change" });
    }
    const tokensJson = JSON.stringify(tokens);
    const resulting = effectiveCss(tokensJson, css);
    const { components } = schema;
    const [updated] = await getDb()
      .update(components)
      .set({
        cssStyles: css,
        designTokensJson: tokensJson,
        ...(args.source === "agent" ? { agentDraftCss: resulting } : { humanFinalCss: resulting }),
        revision: sql`${components.revision} + 1`,
        updatedAt: nowIso(),
      })
      .where(and(eq(components.id, component.id), eq(components.ownerEmail, component.ownerEmail)))
      .returning();
    if (!updated) fail("Component not found.", { errorCode: "not_found", statusCode: 404 });
    const stage = await buildStage(updated);
    await syncRatesToState(updated, stage.stateHash);
    return {
      id: updated.id,
      source: args.source,
      revision: updated.revision,
      changedTokens,
      cssChanged,
      stateHash: stage.stateHash,
      nextRequiredAction: "verify-holdout-widths",
    };
  },
});
