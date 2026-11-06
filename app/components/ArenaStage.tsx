import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { defineClientAction } from "@agent-native/core/client/host";
import { createAgentNativeWebMcpRegistration } from "@agent-native/core/client/webmcp";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import {
  IconArrowLeft,
  IconBook2,
  IconLock,
  IconRefresh,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import {
  ALL_WIDTHS,
  type Finding,
  isHoldoutWidth,
  type SaboteurProfile,
} from "@shared/arena-protocol";
import { FindingsPanel, type GateResult } from "@/components/FindingsPanel";
import { LearnedRules } from "@/components/LearnedRules";
import { SaboteurSwitch } from "@/components/SaboteurSwitch";
import { StageViewport } from "@/components/StageViewport";
import { TokenSurgery } from "@/components/TokenSurgery";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WidthPanes } from "@/components/WidthPanes";
import { type LaneChange, WidthRibbon, WidthRibbonSkeleton } from "@/components/WidthRibbon";
import { type LaneState, type StageInput, useArenaSweep } from "@/hooks/use-arena-sweep";
import { sendToAgentChatAndConfirm } from "@agent-native/core/client/agent-chat";
import { measureDocument } from "@/lib/dom-audit";

type ComponentData = AgentNativeActionRegistry["get-component"]["result"];

const errorCodeOf = (error: unknown): string | undefined =>
  error && typeof error === "object" && "errorCode" in error && typeof error.errorCode === "string"
    ? error.errorCode
    : undefined;

const errorDetailsOf = (error: unknown): Record<string, unknown> =>
  error && typeof error === "object" && "details" in error && error.details && typeof error.details === "object"
    ? (error.details as Record<string, unknown>)
    : {};

const pct = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : `${Math.round(value)}%`;

export const ArenaStage = ({ componentId }: { componentId: string }) => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => ({ id: componentId }), [componentId]);
  const queryKey = useMemo(() => ["action", "get-component", params], [params]);
  const { data, isPending, error } = useActionQuery("get-component", params);
  const [liveTokens, setLiveTokens] = useState<Record<string, string>>({});
  const [gate, setGate] = useState<GateResult>(null);
  const [tab, setTab] = useState("findings");

  const stage: StageInput | undefined = data?.stage;
  const latest = data?.latestRun ?? null;
  const measuredHash = latest?.isCurrent ? latest.stateHash : null;
  const sweep = useArenaSweep(componentId, stage, measuredHash);

  // What the last change did: compare each new measured state with the one before it on this component, so an agent
  // patch (or an armed saboteur) shows up as lanes that flipped and a pass-rate delta, not just a new number.
  const previousRun = useRef<{ componentId: string; stateHash: string; verdicts: Map<number, boolean>; pub: number | null; hold: number | null } | null>(null);
  const [change, setChange] = useState<LaneChange | null>(null);
  useEffect(() => {
    if (!latest || !data) return;
    const prev = previousRun.current;
    const verdicts = new Map(latest.verdicts.map((v) => [v.width, v.pass] as const));
    if (prev && prev.componentId !== data.id) setChange(null);
    if (prev && prev.componentId === data.id && prev.stateHash !== latest.stateHash) {
      const fixed = new Set<number>();
      const broke = new Set<number>();
      for (const [width, pass] of verdicts) {
        const before = prev.verdicts.get(width);
        if (before === false && pass) fixed.add(width);
        if (before === true && !pass) broke.add(width);
      }
      const delta = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : Math.round(a - b));
      setChange({ fixed, broke, publicDelta: delta(latest.publicPassRate, prev.pub), holdoutDelta: delta(latest.holdoutPassRate, prev.hold) });
    }
    previousRun.current = { componentId: data.id, stateHash: latest.stateHash, verdicts, pub: latest.publicPassRate, hold: latest.holdoutPassRate };
  }, [latest, data]);

  const widthParam = Number(searchParams.get("w"));
  const defaultWidth =
    latest?.verdicts.find((v) => !v.pass && !v.holdout)?.width ?? 375;
  const activeWidth = ALL_WIDTHS.includes(widthParam) ? widthParam : defaultWidth;
  const selectedSelector = searchParams.get("sel");
  const sealed = isHoldoutWidth(activeWidth);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Keep the armed saboteur visible in navigation state for the agent.
  useEffect(() => {
    if (data && searchParams.get("sab") !== data.saboteurProfile) {
      updateParams({ sab: data.saboteurProfile });
    }
  }, [data, searchParams, updateParams]);

  useEffect(() => setLiveTokens({}), [data?.revision]);

  const displayLanes: Record<number, LaneState> = useMemo(() => {
    if (sweep.running || (stage && Object.keys(sweep.lanes).length && !latest?.isCurrent)) {
      return sweep.lanes;
    }
    return Object.fromEntries(
      (latest?.verdicts ?? []).map((v) => [v.width, v.pass ? "pass" : "fail"] as const),
    );
  }, [sweep.running, sweep.lanes, latest, stage]);

  const findingsAtWidth: Finding[] = useMemo(() => {
    if (sealed) return [];
    if (sweep.running) return sweep.liveFindings.filter((f) => f.width === activeWidth);
    return (latest?.findings ?? []).filter((f) => f.width === activeWidth);
  }, [sealed, sweep.running, sweep.liveFindings, latest, activeWidth]);

  const selectedFinding = findingsAtWidth.find((f) => f.selector === selectedSelector) ?? null;

  // ---------- mutations (optimistic) ----------

  const patch = useActionMutation("patch-component-tokens", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: ComponentData | undefined) => {
        if (!old) return old;
        const tokens = { ...old.designTokens };
        for (const [k, v] of Object.entries(input.tokens ?? {})) {
          if (v === null) delete tokens[k];
          else tokens[k] = v;
        }
        return { ...old, designTokens: tokens, cssStyles: input.css ?? old.cssStyles };
      });
      return { previous };
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(queryKey, (context as { previous?: unknown } | undefined)?.previous);
      setLiveTokens({});
      toast.error(actionErrorMessage(err) ?? "Patch failed.");
    },
  });

  const saveMarkup = useActionMutation("save-component", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: ComponentData | undefined) =>
        old ? { ...old, htmlMarkup: input.html } : old,
      );
      return { previous };
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(queryKey, (context as { previous?: unknown } | undefined)?.previous);
      toast.error(actionErrorMessage(err) ?? "Could not save markup.");
    },
  });

  const arm = useActionMutation("inject-saboteur-payload", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: ComponentData | undefined) =>
        old ? { ...old, saboteurProfile: input.profile } : old,
      );
      updateParams({ sab: input.profile, sel: null });
      return { previous };
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(queryKey, (context as { previous?: unknown } | undefined)?.previous);
      toast.error(actionErrorMessage(err) ?? "Could not arm the saboteur.");
    },
    onSuccess: (result) => {
      if (result.profile !== "none") {
        const r = result.report;
        toast.success(
          result.profile === "i18n-expansion"
            ? `Expanded ${r.textNodesTouched} text nodes: ${r.charsBefore} → ${r.charsAfter} chars`
            : result.profile === "payload-extremes"
              ? `${r.longTokensInjected} long tokens, ${r.numbersReplaced} numbers, ${r.listsEmptied} lists emptied, ${r.optionalDropped} optional fields dropped`
              : result.profile === "rtl-mirror"
                ? "Mirrored to dir=rtl"
                : `Root font scaled to ${result.rootFontScale * 100}%`,
        );
      }
    },
  });

  const verify = useActionMutation("verify-holdout-widths", {
    onMutate: () => setGate(null),
    onSuccess: (result) =>
      setGate({ kind: "pass", message: result.message, failingPublic: result.failingPublicWidths }),
    onError: (err) => {
      const code = errorCodeOf(err);
      if (code === "HOLDOUT_REGRESSION") {
        const lanes = Number(errorDetailsOf(err).failingHoldoutLanes ?? 0);
        setGate({ kind: "regression", lanes, message: `${lanes} of 5 sealed lanes still overflow or collide.` });
      } else if (code === "AUDIT_PENDING") {
        setGate({ kind: "pending", message: "The current state is still being measured. Try again when the ribbon settles." });
      } else {
        toast.error(actionErrorMessage(err) ?? "Gate check failed.");
      }
    },
  });

  const learn = useActionMutation("capture-design-learning", {
    onSuccess: (result) => {
      toast.success(`Banked ${result.patterns.length || 1} layout rule${result.patterns.length === 1 ? "" : "s"} from your hand edit`);
      setTab("rules");
    },
    onError: (err) => toast.error(actionErrorMessage(err) ?? "Could not capture the learning."),
  });

  useEffect(() => setGate(null), [data?.stage.stateHash]);

  // ---------- agent hand-off ----------

  const sendToAgent = () => {
    if (!data) return;
    const failingPublic = latest?.verdicts.filter((v) => !v.pass && !v.holdout).map((v) => v.width) ?? [];
    const message = selectedFinding
      ? `Fix the ${selectedFinding.rule} on \`${selectedFinding.selector}\` at ${activeWidth}px in "${data.name}" (${selectedFinding.detail}). Patch with source "agent", then pass verify-holdout-widths without regressing other lanes.`
      : `Clear the failing lanes in "${data.name}" (failing public widths: ${failingPublic.join(", ") || "none"}). Patch with source "agent", then pass verify-holdout-widths.`;
    const payload = {
      message,
      context: JSON.stringify({
        componentId: data.id,
        activeWidth,
        selectedSelector,
        finding: selectedFinding,
        saboteurProfile: data.saboteurProfile,
        revision: data.revision,
      }),
      submit: true,
      openSidebar: true,
      chatTarget: "local" as const,
    };
    void sendToAgentChatAndConfirm(payload, { timeoutMs: 2400 }).then((res) => {
      if (!res.delivered) void sendToAgentChatAndConfirm(payload, { timeoutMs: 5500 });
    });
  };

  // ---------- WebMCP: live DOM tools for in-tab agents ----------

  const stageRef = useRef(stage);
  stageRef.current = stage;
  const sweepRef = useRef(sweep.sweep);
  sweepRef.current = sweep.sweep;
  const probeRef = sweep.probeRef;

  useEffect(() => {
    const registration = createAgentNativeWebMcpRegistration({
      actions: [
        defineClientAction<Record<string, never>, unknown>({
          name: "run-viewport-sweep",
          title: "Run live 33-width sweep",
          description:
            "Re-measure the open BrawlStage component across all 28 public and 5 holdout widths in the live iframe and record the run. Returns public pass rate and sealed holdout lane count.",
          schema: { type: "object", properties: {} },
          run: async () => {
            const current = stageRef.current;
            if (!current) return { error: "No component is open on the stage." };
            const outcome = await sweepRef.current({ ...current });
            if (!outcome) return { status: "already-measuring" };
            const failingWidths = [...new Set(outcome.findings.filter((f) => !isHoldoutWidth(f.width) && f.rule !== "target-undersize").map((f) => f.width))];
            return { recorded: outcome.recorded, durationMs: outcome.durationMs, failingPublicWidths: failingWidths };
          },
        }),
        defineClientAction<{ width: number }, unknown>({
          name: "measure-stage-width",
          title: "Measure one public width",
          description:
            "Measure the open component at one public viewport width in the live iframe without recording. Holdout widths are refused.",
          schema: {
            type: "object",
            properties: { width: { type: "number", description: "Public lane width in px" } },
            required: ["width"],
          },
          readOnly: true,
          run: async ({ width }) => {
            if (isHoldoutWidth(width)) return { error: "Holdout widths are sealed." };
            const probe = probeRef.current;
            if (!probe) return { error: "Stage not ready." };
            probe.style.width = `${width}px`;
            void probe.offsetWidth;
            return { width, findings: measureDocument(probe, width) };
          },
        }),
      ],
      getContext: () => ({ route: { name: window.location.pathname } }),
    });
    void registration.start();
    return () => registration.stop();
  }, [componentId, probeRef]);

  // ---------- render ----------

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-muted-foreground">{actionErrorMessage(error) ?? "Component not found."}</p>
        <Link to="/arena" className="mt-3 inline-block text-sm underline">
          Back to the fight card
        </Link>
      </main>
    );
  }

  if (isPending || !data || !stage) return <ArenaStageSkeleton />;

  const stale = !!latest && !latest.isCurrent && !sweep.running;
  const canLearn = !!data.agentDraftCss && !!data.humanFinalCss && data.agentDraftCss !== data.humanFinalCss;

  return (
    <div className="bs-ring-floor relative flex h-full min-h-0 flex-col max-lg:overflow-y-auto lg:pr-[384px]">
      <section className="bs-float z-10 m-3 mb-0 shrink-0" aria-label="Component and widths">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2 pl-2 pr-2">
          <Link
            to="/arena"
            aria-label="Back to the fight card"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconArrowLeft className="size-4" />
          </Link>
          <div className="min-w-[10rem] flex-1">
            <h1 className="truncate font-display text-[15px] leading-tight">{data.name}</h1>
            <p className="truncate text-[13px] text-muted-foreground">
              Revision {data.revision} · {sweep.running ? "measuring…" : stale ? "re-measuring" : sweep.lastDuration ? `swept 33 widths in ${sweep.lastDuration} ms` : "measured"}
            </p>
          </div>
          <SaboteurSwitch
            value={data.saboteurProfile as SaboteurProfile}
            disabled={arm.isPending}
            onChange={(profile) => arm.mutate({ id: data.id, profile })}
          />
          <dl className="flex items-end gap-5" aria-label="Pass rates">
            <div className="text-right">
              <dt className="text-[12px] text-muted-foreground">Public widths</dt>
              <dd className="flex items-baseline justify-end gap-1.5">
                <DeltaChip value={change?.publicDelta ?? null} />
                <span className="bs-score text-2xl">{pct(latest?.publicPassRate)}</span>
              </dd>
            </div>
            <div className="text-right">
              <dt className="flex items-center justify-end gap-1 text-[12px] text-[hsl(var(--bs-caution))]">
                <IconLock className="size-3.5" /> Sealed widths
              </dt>
              <dd className="flex items-baseline justify-end gap-1.5">
                <DeltaChip value={change?.holdoutDelta ?? null} />
                <span className="bs-score text-2xl">{pct(latest?.holdoutPassRate)}</span>
              </dd>
            </div>
          </dl>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Re-sweep all 33 widths"
              disabled={sweep.running}
              onClick={() => void sweep.sweep({ ...stage })}
            >
              <IconRefresh className={sweep.running ? "size-4 motion-safe:animate-spin" : "size-4"} />
            </Button>
            <AgentToggleButton />
          </div>
        </header>
        <div className="border-t border-border px-3 pb-1">
          <WidthRibbon
            lanes={displayLanes}
            change={change}
            activeWidth={activeWidth}
            stale={stale}
            onSelect={(w) => updateParams({ w: String(w), sel: null })}
          />
        </div>
      </section>

      {/* Focused pane (measured, with findings drawn on it) beside every other width at one zoom. */}
      <div className="flex min-h-0 flex-1 gap-4 p-3 max-lg:flex-none max-lg:flex-col">
        <div className="flex min-h-[440px] min-w-0 flex-[1.15] flex-col">
          <div className="flex items-center justify-between px-1 pb-2 text-[13px]">
            <span className="font-medium">Focused · {activeWidth}px</span>
            <span className="text-[12px] text-muted-foreground">{sealed ? "Sealed lane — findings hidden" : `${findingsAtWidth.length} finding${findingsAtWidth.length === 1 ? "" : "s"}`}</span>
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
            <StageViewport
              stage={stage}
              width={activeWidth}
              findings={findingsAtWidth}
              sealed={sealed}
              selectedSelector={selectedSelector}
              liveTokens={liveTokens}
              onSelectFinding={(sel) => updateParams({ sel })}
            />
          </div>
        </div>
        <WidthPanes stage={stage} lanes={displayLanes} activeWidth={activeWidth} onSelect={(w) => updateParams({ w: String(w), sel: null })} />
      </div>
        <aside className="bs-float z-10 m-3 flex flex-col overflow-hidden max-lg:h-[80vh] max-lg:flex-none lg:absolute lg:bottom-3 lg:right-3 lg:top-3 lg:m-0 lg:w-[360px]">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-3 grid grid-cols-3 rounded-md">
              <TabsTrigger value="findings" className="rounded-md font-display text-[11px]">Findings</TabsTrigger>
              <TabsTrigger value="surgery" className="rounded-md font-display text-[11px]">Surgery</TabsTrigger>
              <TabsTrigger value="rules" className="rounded-md font-display text-[11px]">
                Rules{data.learnedRules.length ? ` · ${data.learnedRules.length}` : ""}
              </TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
              <TabsContent value="findings" className="mt-0">
                <FindingsPanel
                  width={activeWidth}
                  sealed={sealed}
                  findings={findingsAtWidth}
                  measuring={sweep.running}
                  selectedSelector={selectedSelector}
                  gate={gate}
                  gatePending={verify.isPending}
                  onSelect={(sel) => updateParams({ sel })}
                  onSendToAgent={sendToAgent}
                  onRunGate={() => verify.mutate({ id: data.id })}
                />
              </TabsContent>
              <TabsContent value="surgery" className="mt-0 space-y-4">
                {canLearn ? (
                  <div className="rounded-md border border-[hsl(var(--bs-caution))] p-3">
                    <p className="font-display text-xs text-[hsl(var(--bs-caution))]">Your hand edit differs from the agent draft</p>
                    <Button
                      size="sm"
                      className="mt-2 h-8 w-full rounded-md font-display text-[11px]"
                      disabled={learn.isPending}
                      onClick={() => learn.mutate({ id: data.id })}
                    >
                      <IconBook2 className="size-4" />
                      {learn.isPending ? "Diffing…" : "Bank it as a layout rule"}
                    </Button>
                  </div>
                ) : null}
                <TokenSurgery
                  tokens={data.designTokens}
                  css={data.cssStyles}
                  html={data.htmlMarkup}
                  pending={patch.isPending || saveMarkup.isPending}
                  onLive={(name, value) => setLiveTokens((prev) => ({ ...prev, [name]: value }))}
                  onCommitToken={(name, value) =>
                    patch.mutate({ id: data.id, source: "human", tokens: { [name]: value } })
                  }
                  onCommitCss={(css) => patch.mutate({ id: data.id, source: "human", css })}
                  onCommitHtml={(html) =>
                    saveMarkup.mutate({ id: data.id, name: data.name, html, css: data.cssStyles })
                  }
                />
              </TabsContent>
              <TabsContent value="rules" className="mt-0">
                <LearnedRules rules={data.learnedRules} />
              </TabsContent>
            </div>
          </Tabs>
        </aside>

      {/* Hidden probe: the sweep engine measures here so the visible stage never jumps. */}
      <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 size-0 overflow-hidden">
        <iframe
          ref={sweep.probeRef}
          title="Measurement probe"
          tabIndex={-1}
          sandbox="allow-same-origin"
          className="border-0"
          style={{ height: 900, width: 375 }}
        />
      </div>
    </div>
  );
};

export const ArenaStageSkeleton = () => (
  <div className="flex h-full min-h-0 flex-col">
    <div className="flex items-center gap-6 border-b border-border px-4 py-3">
      <Skeleton className="size-4 rounded-md" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-5 w-64 rounded-md" />
        <Skeleton className="h-2.5 w-28 rounded-md" />
      </div>
      <Skeleton className="h-8 w-80 rounded-md" />
      <Skeleton className="h-9 w-32 rounded-md" />
    </div>
    <div className="overflow-hidden border-b border-border px-3 pb-1">
      <WidthRibbonSkeleton />
    </div>
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex flex-1 items-start justify-center bg-[hsl(var(--bs-stage))] p-6">
        <Skeleton className="h-80 w-full max-w-3xl rounded-md" />
      </div>
      <div className="w-full space-y-2 p-3 lg:w-[360px]">
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    </div>
  </div>
);

const DeltaChip = ({ value }: { value: number | null }) =>
  value ? (
    <span
      className={`font-mono-num text-[11px] leading-none ${value > 0 ? "text-[hsl(var(--bs-clean))]" : "text-[hsl(var(--bs-knockdown))]"}`}
      aria-label={`${value > 0 ? "up" : "down"} ${Math.abs(value)} points since the last change`}
    >
      {value > 0 ? "▲" : "▼"} {Math.abs(value)}
    </span>
  ) : null;
