import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { defineAction, fail } from "@agent-native/core/action";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadComponent, nowIso } from "../server/lib/arena.js";
import {
  declarationDeltas,
  extractInvariant,
  unifiedDiff,
} from "../server/lib/css-learning.js";

const SKILL_PATH = ".agents/skills/learned-layout-rules/SKILL.md";

const SKILL_HEADER = `---
name: learned-layout-rules
description: >-
  Layout invariants learned from human hand edits that corrected agent CSS
  drafts in BrawlStage. Read before patching component CSS or tokens.
scope: both
---

# Learned Layout Rules

Each entry below was extracted by \`capture-design-learning\` from a real
unified diff between an agent draft and the human's final CSS. Apply these
rules to new drafts before calling \`patch-component-tokens\`.

No rules below this line means none have been learned yet: draft from first principles.
`;

export default defineAction({
  description:
    "\"Hand edits are gold\": diff the agent's CSS draft against the human's final hand-edited CSS for a component, store the unified diff and the extracted layout invariant in learned_rules, and append the rule to .agents/skills/learned-layout-rules/SKILL.md so future agent drafts follow it.",
  schema: z.object({
    id: z.string().describe("Component id with both an agent draft and a later human edit"),
  }),
  outputSchema: z.object({
    id: z.string(),
    componentId: z.string(),
    patterns: z.array(z.string()),
    extractedInvariant: z.string(),
    linesAdded: z.number(),
    linesRemoved: z.number(),
    skillPath: z.string(),
    skillFileWritten: z.boolean(),
  }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  changeResource: (input) => ({ resourceType: "component", resourceId: input.id }),
  run: async ({ id }) => {
    await assertAccess("component", id, "editor");
    const component = await loadComponent(id);
    const before = component.agentDraftCss;
    const after = component.humanFinalCss;
    if (!before) {
      fail("No agent draft recorded yet; an agent must patch with source \"agent\" first.", {
        errorCode: "no_agent_draft",
        statusCode: 409,
      });
    }
    if (!after || after === before) {
      fail("No human hand edit differs from the agent draft yet.", {
        errorCode: "no_human_edit",
        statusCode: 409,
      });
    }
    const diff = unifiedDiff(before, after, {
      from: `agent_draft/${component.slug}.css`,
      to: `human_final/${component.slug}.css`,
    });
    const deltas = declarationDeltas(before, after);
    const { patterns, text } = extractInvariant(deltas);
    const lines = diff.split("\n");
    const linesAdded = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
    const linesRemoved = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;

    const rule = {
      id: crypto.randomUUID(),
      componentId: component.id,
      beforeCss: before,
      afterCss: after,
      unifiedDiff: diff,
      extractedInvariant: text,
      skillPath: SKILL_PATH,
      createdAt: nowIso(),
      ownerEmail: component.ownerEmail,
      orgId: component.orgId,
      visibility: component.visibility,
    };
    await getDb().insert(schema.learnedRules).values(rule);

    // Skill files live in the app's source tree. Deployments with a read-only
    // filesystem still keep the rule in SQL; the result says which happened.
    let skillFileWritten = false;
    try {
      const file = path.join(process.cwd(), SKILL_PATH);
      await mkdir(path.dirname(file), { recursive: true });
      const existing = await readFile(file, "utf8").catch(() => "");
      if (!existing) await writeFile(file, SKILL_HEADER, "utf8");
      const entry = [
        "",
        `## ${component.name} — ${rule.createdAt.slice(0, 10)}`,
        "",
        patterns.length ? `Patterns: ${patterns.map((p) => `\`${p}\``).join(", ")}` : "Patterns: (declaration-level preference)",
        "",
        text,
        "",
        "```diff",
        diff.split("\n").slice(0, 60).join("\n"),
        "```",
        "",
      ].join("\n");
      await appendFile(file, entry, "utf8");
      skillFileWritten = true;
    } catch {
      skillFileWritten = false;
    }

    return {
      id: rule.id,
      componentId: component.id,
      patterns,
      extractedInvariant: text,
      linesAdded,
      linesRemoved,
      skillPath: SKILL_PATH,
      skillFileWritten,
    };
  },
});
