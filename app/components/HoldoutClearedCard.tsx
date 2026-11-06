import { registerActionChatRenderer, type ToolRendererProps } from "@agent-native/toolkit/app/chat";
import { IconArrowRight, IconLock } from "@tabler/icons-react";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router";

import { Skeleton } from "@/components/ui/skeleton";

const activeHoldoutWidgets = new Map<string, string>();

type HoldoutCleared = {
  id: string;
  componentName: string;
  holdoutWidthsChecked: number;
  publicPassRate: number | null;
  failingPublicWidths: number[];
  publicLanes: { width: number; pass: boolean }[];
};

const isHoldoutCleared = (value: unknown): value is HoldoutCleared =>
  !!value &&
  typeof value === "object" &&
  "publicLanes" in value &&
  "holdoutWidthsChecked" in value &&
  "componentName" in value;

// The bell after the last round: sealed lanes stay anonymous, public lanes show as the same ramp the stage uses.
export const HoldoutClearedCard = ({ context }: ToolRendererProps) => {
  const instanceKey = useId();
  const [isPrimary, setIsPrimary] = useState(true);
  useEffect(() => {
    const wid = context.widgetId;
    if (!wid) return;
    const current = activeHoldoutWidgets.get(wid);
    if (current && current !== instanceKey) {
      setIsPrimary(false);
      return;
    }
    activeHoldoutWidgets.set(wid, instanceKey);
    return () => {
      if (activeHoldoutWidgets.get(wid) === instanceKey) activeHoldoutWidgets.delete(wid);
    };
  }, [context.widgetId, instanceKey]);
  if (!isPrimary) return null;
  if (context.isRunning) {
    return (
      <div className="my-2 w-full max-w-md rounded-md border border-border bg-card p-3" aria-busy="true">
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="mt-3 h-8 w-full rounded-md" />
      </div>
    );
  }
  const r = context.resultJson;
  if (!isHoldoutCleared(r)) return null;
  const max = Math.max(...r.publicLanes.map((l) => l.width), 1);

  return (
    <article className="my-2 w-full max-w-md rounded-md border border-[hsl(var(--bs-clean)/0.6)] bg-card">
      <header className="flex items-center justify-between gap-2 bg-[hsl(var(--bs-clean))] px-3 py-1.5 text-[hsl(var(--bs-caution-ink))]">
        <span className="font-display text-sm tracking-wide">HOLDOUT GATE · CLEARED</span>
        <span className="font-mono-num text-[11px]">{r.holdoutWidthsChecked}/{r.holdoutWidthsChecked} sealed</span>
      </header>

      <div className="px-3 pt-2.5">
        <h3 className="font-display truncate text-lg leading-tight">{r.componentName}</h3>
        <p className="text-[11px] text-muted-foreground">
          No overflow or collisions at any sealed width. Which widths those are stays sealed.
        </p>
      </div>

      <div className="flex items-center gap-1.5 px-3 pt-2.5" aria-label={`${r.holdoutWidthsChecked} sealed holdout lanes, all clear`}>
        {Array.from({ length: r.holdoutWidthsChecked }, (_, i) => (
          <span
            key={i}
            className="grid h-6 flex-1 place-items-center rounded-md border border-[hsl(var(--bs-clean)/0.7)] bg-[hsl(var(--bs-clean)/0.15)]"
          >
            <IconLock className="size-3 text-[hsl(var(--bs-clean))]" aria-hidden="true" />
          </span>
        ))}
      </div>

      <div className="px-3 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-[11px] text-muted-foreground">PUBLIC 28</span>
          <span className="font-mono-num text-xs">{r.publicPassRate ?? "—"}%</span>
        </div>
        <div className="mt-1 flex h-8 items-end gap-[2px]" role="img" aria-label="Public lane results by width">
          {r.publicLanes.map((lane) => (
            <span
              key={lane.width}
              title={`${lane.width}px ${lane.pass ? "clean" : "failing"}`}
              className={lane.pass ? "flex-1 bg-[hsl(var(--bs-clean))]" : "flex-1 bg-[hsl(var(--bs-knockdown))]"}
              style={{ height: `${10 + (lane.width / max) * 22}px` }}
            />
          ))}
        </div>
        {r.failingPublicWidths.length ? (
          <p className="font-mono-num pt-1 text-[11px] text-[hsl(var(--bs-knockdown))]">
            still failing in public: {r.failingPublicWidths.join(", ")} px
          </p>
        ) : null}
      </div>

      <footer className="mt-2.5 flex justify-end border-t border-border px-3 py-2">
        <Link
          to={`/arena/${encodeURIComponent(r.id)}`}
          className="font-display inline-flex items-center gap-1 rounded-md bg-[hsl(var(--bs-caution))] px-2 py-1 text-[11px] text-[hsl(var(--bs-caution-ink))] hover:bg-[hsl(var(--bs-caution)/0.88)]"
        >
          BACK TO THE STAGE <IconArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </footer>
    </article>
  );
};

registerActionChatRenderer({
  id: "brawlstage.holdout-cleared",
  renderer: "brawlstage.holdout-cleared",
  Component: HoldoutClearedCard,
});
