import { IconLock, IconMessageForward, IconShieldCheck } from "@tabler/icons-react";

import type { Finding } from "@shared/arena-protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GateResult =
  | { kind: "pass"; message: string; failingPublic: number[] }
  | { kind: "regression"; message: string; lanes: number }
  | { kind: "pending"; message: string }
  | null;

type FindingsPanelProps = {
  width: number;
  sealed: boolean;
  findings: Finding[];
  measuring: boolean;
  selectedSelector: string | null;
  gate: GateResult;
  gatePending: boolean;
  onSelect: (selector: string | null) => void;
  onSendToAgent: () => void;
  onRunGate: () => void;
};

export type { GateResult };

// Worst first: layout breaks, then collisions, then contrast; advisory last.
const RULE_ORDER = [
  "page-overflow-x",
  "escapes-viewport",
  "clipped-content",
  "aabb-collision",
  "target-crowding",
  "contrast",
  "target-undersize",
] as const;

const RULE_TONE_TEXT: Record<string, string> = {
  "page-overflow-x": "text-[hsl(var(--bs-knockdown))]",
  "escapes-viewport": "text-[hsl(var(--bs-knockdown))]",
  "clipped-content": "text-[hsl(var(--bs-knockdown))]",
  "aabb-collision": "text-[hsl(var(--bs-knockdown))]",
  "target-crowding": "text-[hsl(var(--bs-knockdown))]",
  contrast: "text-[hsl(var(--bs-caution))]",
  "target-undersize": "text-muted-foreground",
};

const RULE_LABEL: Record<string, string> = {
  "page-overflow-x": "Page overflow",
  "escapes-viewport": "Escapes viewport",
  "clipped-content": "Clipped / spill",
  "aabb-collision": "AABB collision",
  "target-crowding": "Target crowding",
  contrast: "Contrast",
  "target-undersize": "Small target",
};

export const FindingsPanel = ({
  width,
  sealed,
  findings,
  measuring,
  selectedSelector,
  gate,
  gatePending,
  onSelect,
  onSendToAgent,
  onRunGate,
}: FindingsPanelProps) => {
  const failing = findings.filter((f) => f.rule !== "target-undersize");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="h-9 rounded-md bg-[hsl(var(--bs-caution))] font-display text-xs text-[hsl(var(--bs-caution-ink))] hover:bg-[hsl(var(--bs-caution)/0.88)]"
          onClick={onSendToAgent}
        >
          <IconMessageForward className="size-4" />
          Send to agent
        </Button>
        <Button
          variant="outline"
          className="h-9 rounded-md font-display text-xs"
          disabled={gatePending}
          onClick={onRunGate}
        >
          <IconShieldCheck className="size-4" />
          {gatePending ? "Checking…" : "Holdout gate"}
        </Button>
      </div>

      {gate ? (
        <div
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            gate.kind === "pass" && "border-[hsl(var(--bs-clean))] text-[hsl(var(--bs-clean))]",
            gate.kind === "regression" && "border-[hsl(var(--bs-knockdown))] bg-[hsl(var(--bs-knockdown)/0.08)] text-[hsl(var(--bs-knockdown))]",
            gate.kind === "pending" && "border-border text-muted-foreground",
          )}
        >
          <p className="font-display text-[13px]">
            {gate.kind === "pass" ? "Gate cleared" : gate.kind === "regression" ? "Knockdown · holdout regression" : "Measurement pending"}
          </p>
          <p className="mt-0.5 text-foreground/80">{gate.message}</p>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h3 className="font-display text-sm">{width}px lane</h3>
        <span className="font-mono-num text-[11px] text-muted-foreground">
          {sealed ? "sealed" : `${failing.length} failing · ${findings.length - failing.length} advisory`}
        </span>
      </div>

      {sealed ? (
        <div className="bs-hatch rounded-md border border-[hsl(var(--bs-caution)/0.6)] p-3">
          <div className="flex items-center gap-2 bg-background/90 p-2 text-xs">
            <IconLock className="size-4 shrink-0 text-[hsl(var(--bs-caution))]" />
            Holdout lanes report pass/fail only. Fix the general layout; the gate will tell you if a sealed width still breaks.
          </div>
        </div>
      ) : measuring && findings.length === 0 ? (
        <ul className="space-y-2" aria-label="Measuring">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </ul>
      ) : findings.length === 0 ? (
        <p className="py-6 text-center font-display text-sm text-[hsl(var(--bs-clean))]">Clean lane — nothing overflows, collides, or fails contrast.</p>
      ) : (
        <div className="space-y-4">
          {RULE_ORDER.filter((rule) => findings.some((f) => f.rule === rule)).map((rule) => {
            const items = findings.filter((f) => f.rule === rule);
            const advisory = rule === "target-undersize";
            const group = (
              <ul className="divide-y divide-border border-y border-border">
                {items.map((f, i) => {
                  const selected = f.selector === selectedSelector;
                  return (
                    <li key={`${f.selector}-${i}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(selected ? null : f.selector)}
                        className={cn(
                          "grid w-full grid-cols-[1fr_auto] gap-x-3 px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "bg-[hsl(var(--bs-caution)/0.12)] shadow-[inset_2px_0_0_hsl(var(--bs-caution))]" : "hover:bg-accent",
                        )}
                      >
                        <span className="truncate font-mono-num text-[11px]" title={f.selector}>
                          {f.selector.split(" > ").slice(-2).join(" › ")}
                        </span>
                        <span className="font-mono-num text-[11px] text-foreground">
                          {f.rule === "contrast" ? `${f.ratio}:1` : `${f.overflow_px}px`}
                        </span>
                        <span className="col-span-2 truncate text-[11px] text-muted-foreground" title={f.detail}>
                          {f.detail}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            );
            const header = (
              <span className="flex items-baseline justify-between">
                <span className={cn("font-display text-[12px]", RULE_TONE_TEXT[rule])}>{RULE_LABEL[rule]}</span>
                <span className="font-mono-num text-[11px] text-muted-foreground">×{items.length}</span>
              </span>
            );
            return advisory ? (
              <details key={rule} className="group">
                <summary className="cursor-pointer list-none">
                  {header}
                  <span className="text-[11px] text-muted-foreground">Advisory — doesn't fail the lane. Show</span>
                </summary>
                <div className="mt-1.5">{group}</div>
              </details>
            ) : (
              <section key={rule} className="space-y-1.5">
                {header}
                {group}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
