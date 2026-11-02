import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { assertAccess } from "@agent-native/core/sharing";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  ensureWorkspaceSeed,
  loadComponent,
  nowIso,
  requireUser,
  validateTokens,
} from "../server/lib/arena.js";

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "component";

export default defineAction({
  description:
    "Create a component (omit id) or replace an existing component's name, HTML markup, CSS, and design tokens. For surgical token or rule edits use patch-component-tokens instead so agent drafts and human edits are tracked.",
  schema: z.object({
    id: z.string().optional().describe("Existing component id to update; omit to create a new component"),
    name: z.string().min(1).max(120).describe("Display name, e.g. \"Checkout summary card\""),
    html: z.string().min(1).max(60000).describe("Component HTML markup rendered inside #bs-root (scripts never execute)"),
    css: z.string().max(60000).describe("Component CSS; reference design tokens with var(--token-name)"),
    tokens: z
      .record(z.string(), z.string())
      .optional()
      .describe("Design tokens as CSS custom properties, e.g. {\"--space-gap\": \"16px\"}; omit to keep existing tokens"),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    revision: z.number(),
    created: z.boolean(),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "arena",
      to: `/arena/${encodeURIComponent(result.id)}`,
      params: { componentId: result.id },
    }),
    label: `Open ${result.name}`,
  }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  changeResource: (_input, result) => ({ resourceType: "component", resourceId: result.id }),
  run: async (args, ctx) => {
    const { ownerEmail, orgId } = requireUser(ctx);
    if (/<script\b/i.test(args.html)) {
      fail("Component markup may not contain <script> tags; the stage never runs scripts.", {
        errorCode: "script_not_allowed",
      });
    }
    if (args.tokens) validateTokens(args.tokens);
    const db = getDb();
    const { components } = schema;
    if (!args.id) {
      await ensureWorkspaceSeed(ctx);
      const row = {
        id: crypto.randomUUID(),
        name: args.name,
        slug: slugify(args.name),
        htmlMarkup: args.html,
        cssStyles: args.css,
        designTokensJson: JSON.stringify(args.tokens ?? {}),
        ownerEmail,
        orgId,
        visibility: orgId ? ("org" as const) : ("private" as const),
        updatedAt: nowIso(),
      };
      await db.insert(components).values(row);
      return { id: row.id, name: row.name, slug: row.slug, revision: 1, created: true };
    }
    await assertAccess("component", args.id, "editor");
    const current = await loadComponent(args.id);
    const [updated] = await db
      .update(components)
      .set({
        name: args.name,
        slug: slugify(args.name),
        htmlMarkup: args.html,
        cssStyles: args.css,
        ...(args.tokens ? { designTokensJson: JSON.stringify(args.tokens) } : {}),
        revision: sql`${components.revision} + 1`,
        updatedAt: nowIso(),
      })
      .where(
        and(
          eq(components.id, args.id),
          eq(components.ownerEmail, current.ownerEmail),
        ),
      )
      .returning({ id: components.id, name: components.name, slug: components.slug, revision: components.revision });
    if (!updated) fail("Component not found.", { errorCode: "not_found", statusCode: 404 });
    return { ...updated, created: false };
  },
});
