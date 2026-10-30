import { fail } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { and, desc, eq } from "drizzle-orm";

import {
  type Finding,
  COLLISION_RULES,
  FAILING_RULES,
  HOLDOUT_WIDTHS,
  OVERFLOW_RULES,
  PUBLIC_WIDTHS,
  type SaboteurProfile,
} from "../../shared/arena-protocol.js";
import { getDb, schema } from "../db/index.js";
import { sha256 } from "./css-learning.js";
import {
  applySaboteur,
  DEFAULT_CHAOS_CASES,
  type StressedDocument,
  transformSpecSchema,
} from "./saboteur.js";
import { SEED_COMPONENTS } from "./seed-components.js";

export type ActionCtx = { userEmail?: string | null; orgId?: string | null } | undefined;

export type ComponentRow = typeof schema.components.$inferSelect;

export const requireUser = (ctx: ActionCtx): { ownerEmail: string; orgId: string | null } => {
  const ownerEmail =
    ctx?.userEmail ?? fail("Sign in to use the arena.", { statusCode: 401, errorCode: "unauthenticated" });
  return { ownerEmail, orgId: ctx?.orgId ?? null };
};

// First visit to the arena inserts the chaos library and three starter
// components for this workspace. Guarded by the chaos library's presence so
// deleting components never resurrects them.
// Parallel first requests (stage + agent) share a single seeding pass per owner.
const seedingByOwner = new Map<string, Promise<void>>();

export const ensureWorkspaceSeed = (ctx: ActionCtx): Promise<void> => {
  const { ownerEmail } = requireUser(ctx);
  const pending = seedingByOwner.get(ownerEmail);
  if (pending) return pending;
  const run = seedOwnerWorkspace(ctx).finally(() => seedingByOwner.delete(ownerEmail));
  seedingByOwner.set(ownerEmail, run);
  return run;
};

const seedOwnerWorkspace = async (ctx: ActionCtx): Promise<void> => {
  const { ownerEmail, orgId } = requireUser(ctx);
  const db = getDb();
  const existing = await db
    .select({ id: schema.chaosCases.id })
    .from(schema.chaosCases)
    .where(eq(schema.chaosCases.ownerEmail, ownerEmail))
    .limit(1);
  if (existing.length) return;
  const visibility = orgId ? ("org" as const) : ("private" as const);
  await db.transaction(async (tx) => {
    await tx.insert(schema.chaosCases).values(
      DEFAULT_CHAOS_CASES.map((c) => ({
        id: crypto.randomUUID(),
        name: c.name,
        mutationType: c.spec.kind,
        transformSpecJson: JSON.stringify(c.spec),
        active: true,
        ownerEmail,
        orgId,
        visibility,
      })),
    );
    await tx.insert(schema.components).values(
      SEED_COMPONENTS.map((c) => ({
        id: crypto.randomUUID(),
        name: c.name,
        slug: c.slug,
        htmlMarkup: c.html,
        cssStyles: c.css,
        designTokensJson: JSON.stringify(c.tokens),
        ownerEmail,
        orgId,
        visibility,
      })),
    );
  });
};

export const loadComponent = async (id: string): Promise<ComponentRow> => {
  const { components, componentShares } = schema;
  const [row] = await getDb()
    .select()
    .from(components)
    .where(and(eq(components.id, id), accessFilter(components, componentShares)))
    .limit(1);
  if (!row) fail("Component not found.", { errorCode: "not_found", statusCode: 404 });
  return row;
};

export const parseTokens = (json: string): Record<string, string> => {
  try {
    const value = JSON.parse(json) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      );
    }
  } catch {
    // An unparsable token blob renders as no tokens; save-component validates on write.
  }
  return {};
};

const TOKEN_NAME = /^--[a-zA-Z0-9-]+$/;
const TOKEN_VALUE = /^[^;{}<>]+$/;

export const validateTokens = (tokens: Record<string, string>): void => {
  for (const [name, value] of Object.entries(tokens)) {
    if (!TOKEN_NAME.test(name)) {
      fail(`Token name "${name}" must be a CSS custom property like --space-gap.`, {
        errorCode: "invalid_token",
      });
    }
    if (!TOKEN_VALUE.test(value.trim())) {
      fail(`Token ${name} has an unsafe value.`, { errorCode: "invalid_token" });
    }
  }
};

export const effectiveCss = (tokensJson: string, css: string): string => {
  const tokens = parseTokens(tokensJson);
  const entries = Object.entries(tokens);
  const block = entries.length
    ? `:root {\n${entries.map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}\n`
    : "";
  return `${block}${css}`;
};

export const loadChaosSpec = async (
  ownerEmail: string,
  profile: string,
): Promise<{ id: string; spec: ReturnType<typeof transformSpecSchema.parse> } | null> => {
  if (profile === "none") return null;
  const [row] = await getDb()
    .select()
    .from(schema.chaosCases)
    .where(
      and(
        eq(schema.chaosCases.ownerEmail, ownerEmail),
        eq(schema.chaosCases.mutationType, profile as Exclude<SaboteurProfile, "none">),
        eq(schema.chaosCases.active, true),
      ),
    )
    .limit(1);
  if (!row) return null;
  const parsed = transformSpecSchema.safeParse(JSON.parse(row.transformSpecJson));
  return parsed.success ? { id: row.id, spec: parsed.data } : null;
};

export type Stage = StressedDocument & { css: string; stateHash: string };

export const buildStage = async (component: ComponentRow): Promise<Stage> => {
  const chaos = await loadChaosSpec(component.ownerEmail, component.saboteurProfile);
  const stressed = applySaboteur(component.htmlMarkup, chaos?.spec ?? null);
  const css = effectiveCss(component.designTokensJson, component.cssStyles);
  const stateHash = sha256(
    JSON.stringify({
      html: stressed.html,
      css,
      dir: stressed.dir,
      lang: stressed.lang,
      scale: stressed.rootFontScale,
      profile: component.saboteurProfile,
    }),
  );
  return { ...stressed, css, stateHash };
};

export type WidthVerdict = { width: number; pass: boolean; failing: number; holdout: boolean };

export const verdictsFor = (widths: number[], findings: Finding[]): WidthVerdict[] =>
  widths.map((width) => {
    const failing = findings.filter(
      (f) => f.width === width && FAILING_RULES.includes(f.rule),
    ).length;
    return {
      width,
      pass: failing === 0,
      failing,
      holdout: (HOLDOUT_WIDTHS as readonly number[]).includes(width),
    };
  });

export const summarize = (widths: number[], findings: Finding[]) => {
  const verdicts = verdictsFor(widths, findings);
  const pub = verdicts.filter((v) => (PUBLIC_WIDTHS as readonly number[]).includes(v.width));
  const hold = verdicts.filter((v) => v.holdout);
  const rate = (list: WidthVerdict[]) =>
    list.length ? Math.round((list.filter((v) => v.pass).length / list.length) * 1000) / 10 : null;
  return {
    verdicts,
    overflowCount: findings.filter((f) => OVERFLOW_RULES.includes(f.rule)).length,
    collisionCount: findings.filter((f) => COLLISION_RULES.includes(f.rule)).length,
    contrastFailCount: findings.filter((f) => f.rule === "contrast").length,
    publicPassRate: rate(pub),
    holdoutPassRate: rate(hold),
  };
};

// Prefer the newest run of the exact current state (e.g. after disarming a
// saboteur the earlier clean measurement is current again); else the newest.
export const currentOrLatestRun = async (
  componentId: string,
  ownerEmail: string,
  stateHash: string,
) => {
  const [match] = await getDb()
    .select()
    .from(schema.viewportRuns)
    .where(
      and(
        eq(schema.viewportRuns.componentId, componentId),
        eq(schema.viewportRuns.ownerEmail, ownerEmail),
        eq(schema.viewportRuns.stateHash, stateHash),
      ),
    )
    .orderBy(desc(schema.viewportRuns.createdAt))
    .limit(1);
  return match ?? (await latestRun(componentId, ownerEmail));
};

// Runs copy their component's owner/org so they inherit its access.
export const latestRun = async (componentId: string, ownerEmail: string) => {
  const [row] = await getDb()
    .select()
    .from(schema.viewportRuns)
    .where(
      and(
        eq(schema.viewportRuns.componentId, componentId),
        eq(schema.viewportRuns.ownerEmail, ownerEmail),
      ),
    )
    .orderBy(desc(schema.viewportRuns.createdAt))
    .limit(1);
  return row ?? null;
};

export const parseFindings = (json: string): Finding[] => {
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? (value as Finding[]) : [];
  } catch {
    return [];
  }
};

// Holdout widths are sealed: callers get pass/fail per holdout lane but never
// the selectors, rects or rules measured there, so fixes cannot be tuned to
// the hidden widths.
export const redactHoldout = (findings: Finding[]): Finding[] =>
  findings.filter((f) => !(HOLDOUT_WIDTHS as readonly number[]).includes(f.width));

export const nowIso = (): string => new Date().toISOString();

// After a state change, show the pass rates of that exact state if it was
// measured before (e.g. disarming a saboteur); otherwise clear them until the
// stage re-measures.
export const syncRatesToState = async (component: ComponentRow, stateHash: string): Promise<void> => {
  const [match] = await getDb()
    .select({ pub: schema.viewportRuns.publicPassRate, hold: schema.viewportRuns.holdoutPassRate })
    .from(schema.viewportRuns)
    .where(
      and(
        eq(schema.viewportRuns.componentId, component.id),
        eq(schema.viewportRuns.ownerEmail, component.ownerEmail),
        eq(schema.viewportRuns.stateHash, stateHash),
      ),
    )
    .orderBy(desc(schema.viewportRuns.createdAt))
    .limit(1);
  await getDb()
    .update(schema.components)
    .set({ lastPassRate: match?.pub ?? null, holdoutPassRate: match?.hold ?? null })
    .where(
      and(
        eq(schema.components.id, component.id),
        eq(schema.components.ownerEmail, component.ownerEmail),
      ),
    );
};
