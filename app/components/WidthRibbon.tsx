import { IconLock } from "@tabler/icons-react";

import { ALL_WIDTHS, MAX_WIDTH, MIN_WIDTH, isHoldoutWidth } from "@shared/arena-protocol";
import type { LaneState } from "@/hooks/use-arena-sweep";
import { cn } from "@/lib/utils";

export type LaneChange = { fixed: Set<number>; broke: Set<number>; publicDelta: number | null; holdoutDelta: number | null };

type WidthRibbonProps = {
  lanes: Record<number, LaneState>;
  /** Lanes that flipped since the previous measured state of this component. */
  change?: LaneChange | null;
  activeWidth: number;
  stale: boolean;
  onSelect: (width: number) => void;
};

const laneColor = (state: LaneState | undefined): string => {
  if (state === "pass") return "bg-[hsl(var(--bs-clean))]";
  if (state === "fail") return "bg-[hsl(var(--bs-knockdown))]";
  if (state === "measuring") return "bg-muted-foreground/25";
  return "bg-muted-foreground/15";
};

// 33 lanes as an equalizer ramp: bar height is proportional to the viewport
// width, color is the measured verdict, holdout lanes are hatched and sealed.
export const WidthRibbon = ({ lanes, change, activeWidth, stale, onSelect }: WidthRibbonProps) => (
  <div className="@container overflow-x-auto" role="radiogroup" aria-label="Viewport width lanes">
    <div className="grid min-w-[760px] grid-cols-[repeat(33,minmax(0,1fr))] items-end gap-[3px] px-1 pt-2">
      {ALL_WIDTHS.map((width, index) => {
        const state = lanes[width];
        const holdout = isHoldoutWidth(width);
        const active = width === activeWidth;
        const height = 18 + ((width - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)) * 46;
        const flip = change?.fixed.has(width) ? "fixed" : change?.broke.has(width) ? "broke" : null;
        return (
          <button
            key={width}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${width}px${holdout ? " sealed holdout" : ""}: ${state ?? "not measured"}${flip ? `, ${flip} by the last change` : ""}`}
            onClick={() => onSelect(width)}
            className={cn(
              "group flex flex-col items-center gap-1 rounded-md pb-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-[hsl(var(--bs-caution)/0.12)]",
            )}
          >
            <span className="relative flex h-16 w-full items-end justify-center">
              <span
                className={cn(
                  "bs-lane-sweep relative w-[70%] rounded-t-[1px]",
                  laneColor(state),
                  stale && state !== "measuring" && "opacity-45",
                  active && "outline outline-2 outline-offset-1 outline-[hsl(var(--bs-caution))]",
                )}
                style={{ height: `${height}px` }}
              >
                {holdout ? <span className="bs-hatch absolute inset-0" aria-hidden="true" /> : null}
              </span>
            </span>
            <span
              className={cn(
                "font-mono-num text-[11px] leading-none text-muted-foreground group-hover:text-foreground",
                // Below ~38px a lane can't hold a 4-digit label at 11px: keep every other label (the active one always).
                index % 2 === 1 && !active && "@max-[1250px]:invisible",
                active && "font-semibold text-foreground",
              )}
            >
              {width}
            </span>
            {flip ? (
              <span
                className={cn("text-[11px] leading-[10px]", flip === "fixed" ? "text-[hsl(var(--bs-clean))]" : "text-[hsl(var(--bs-knockdown))]")}
                aria-hidden="true"
              >
                {flip === "fixed" ? "▲" : "▼"}
              </span>
            ) : holdout ? (
              <IconLock className="size-2.5 text-[hsl(var(--bs-caution))]" aria-hidden="true" />
            ) : (
              <span className="size-2.5" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  </div>
);

export const WidthRibbonSkeleton = () => (
  <div className="grid min-w-[760px] grid-cols-[repeat(33,minmax(0,1fr))] items-end gap-[3px] px-1 pt-2">
    {ALL_WIDTHS.map((width) => (
      <div key={width} className="flex flex-col items-center gap-1 pb-1">
        <div className="flex h-16 w-full items-end justify-center">
          <div
            className="w-[70%] animate-pulse rounded-t-[1px] bg-muted"
            style={{ height: `${18 + ((width - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)) * 46}px` }}
          />
        </div>
        <div className="h-2 w-5 animate-pulse rounded-sm bg-muted" />
        <div className="size-2.5" />
      </div>
    ))}
  </div>
);
