import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import { isHoldoutWidth } from "../shared/arena-protocol.js";
import {
  buildStage,
  currentOrLatestRun,
  loadComponent,
  parseFindings,
  summarize,
} from "../server/lib/arena.js";

type Navigation = {
  view?: string;
  route?: string;
  componentId?: string;
  activeWidth?: number;
  selectedSelector?: string;
  saboteurProfile?: string;
};

export default defineAction({
  description:
    "Read what the user is looking at in BrawlStage: the route, active component, active viewport width, armed saboteur profile, selected DOM selector, and the real findings measured at that width (holdout widths stay sealed). Basic navigation is already in <current-screen>; call this for a fresh, detailed read.",
  schema: z.object({}),
  outputSchema: z.object({
    navigation: z.record(z.string(), z.unknown()).nullable(),
    component: z
      .object({
        id: z.string(),
        name: z.string(),
        revision: z.number(),
        saboteurProfile: z.string(),
        publicPassRate: z.number().nullable(),
        holdoutPassRate: z.number().nullable(),
        measurementIsCurrent: z.boolean(),
        failingPublicWidths: z.array(z.number()),
        holdoutFailingLanes: z.number(),
      })
      .nullable(),
    activeWidth: z
      .object({
        width: z.number(),
        sealed: z.boolean(),
        findings: z.array(z.record(z.string(), z.unknown())),
      })
      .nullable(),
    selected: z.record(z.string(), z.unknown()).nullable(),
  }),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState("navigation")) as Navigation | null;
    const empty = { navigation: (navigation as Record<string, unknown> | null) ?? null, component: null, activeWidth: null, selected: null };
    if (!navigation?.componentId) return empty;
    try {
      await assertAccess("component", navigation.componentId, "viewer");
    } catch {
      return empty;
    }
    const component = await loadComponent(navigation.componentId);
    const stage = await buildStage(component);
    const run = await currentOrLatestRun(component.id, component.ownerEmail, stage.stateHash);
    const findings = run ? parseFindings(run.findingsJson) : [];
    const summary = run
      ? summarize(JSON.parse(run.widthsTestedJson) as number[], findings)
      : null;
    const width = navigation.activeWidth ?? null;
    const sealed = width !== null && isHoldoutWidth(width);
    const atWidth = width !== null && !sealed ? findings.filter((f) => f.width === width) : [];
    const selected = navigation.selectedSelector
      ? (atWidth.find((f) => f.selector === navigation.selectedSelector) ?? null)
      : null;
    return {
      navigation: navigation as Record<string, unknown>,
      component: {
        id: component.id,
        name: component.name,
        revision: component.revision,
        saboteurProfile: component.saboteurProfile,
        publicPassRate: run?.publicPassRate ?? null,
        holdoutPassRate: run?.holdoutPassRate ?? null,
        measurementIsCurrent: run?.stateHash === stage.stateHash,
        failingPublicWidths: summary?.verdicts.filter((v) => !v.pass && !v.holdout).map((v) => v.width) ?? [],
        holdoutFailingLanes: summary?.verdicts.filter((v) => v.holdout && !v.pass).length ?? 0,
      },
      activeWidth:
        width === null
          ? null
          : { width, sealed, findings: atWidth.slice(0, 40) as unknown as Record<string, unknown>[] },
      selected: selected as unknown as Record<string, unknown> | null,
    };
  },
});
