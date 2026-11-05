import { useMemo, useState } from "react";

import type { LaneState, StageInput } from "@/hooks/use-arena-sweep";
import { buildSrcDoc } from "@/lib/dom-audit";
import { cn } from "@/lib/utils";

// Public widths only: a pane of a sealed holdout lane would show what the gate is checking.
const PANES = [
  { width: 320, name: "Small phone" },
  { width: 375, name: "Phone" },
  { width: 768, name: "Tablet" },
  { width: 1024, name: "Laptop" },
  { width: 1440, name: "Desktop" },
] as const;

type Props = {
  stage: StageInput;
  lanes: Record<number, LaneState>;
  activeWidth: number;
  onSelect: (width: number) => void;
};

// The component at several real widths side by side, all at one zoom so their sizes stay honest. A layout that
// only breaks on phones, or only on wide screens, is visible without scrubbing.
export const WidthPanes = ({ stage, lanes, activeWidth, onSelect }: Props) => {
  const srcdoc = useMemo(() => buildSrcDoc(stage), [stage]);
  const [zoom, setZoom] = useState(30);
  const k = zoom / 100;
  return (
    <section aria-label="Component at key widths" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[13px] font-medium">All widths</span>
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Zoom
          <input
            type="range"
            min={20}
            max={50}
            step={1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 w-24 accent-[hsl(var(--bs-caution))]"
            aria-label="Pane zoom"
          />
          <span className="w-8 text-right tabular-nums">{zoom}%</span>
        </label>
      </div>
      <div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto pb-2">
        {PANES.map(({ width, name }) => {
          const state = lanes[width];
          const active = width === activeWidth;
          return (
            <button
              key={width}
              type="button"
              onClick={() => onSelect(width)}
              aria-pressed={active}
              aria-label={`Focus ${name}, ${width}px: ${state ?? "not measured"}`}
              className="group flex h-full shrink-0 flex-col text-left outline-none"
              style={{ width: width * k }}
            >
              <span className="flex items-center justify-between gap-2 pb-1.5 text-[12px]">
                <span className={cn("truncate", active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{width * k >= 150 ? name : ""}</span>
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-muted-foreground">
                  {width}px
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full",
                      state === "pass" ? "bg-[hsl(var(--bs-clean))]" : state === "fail" ? "bg-[hsl(var(--bs-knockdown))]" : "bg-muted-foreground/40",
                    )}
                  />
                </span>
              </span>
              <span
                className={cn(
                  "relative block min-h-0 flex-1 overflow-hidden rounded-md bg-white ring-1 transition-shadow",
                  active ? "ring-2 ring-[hsl(var(--bs-caution))]" : state === "fail" ? "ring-[hsl(var(--bs-knockdown)/0.7)]" : "ring-border group-hover:ring-foreground/30",
                )}
              >
                <iframe
                  title={`Component at ${width}px`}
                  srcDoc={srcdoc}
                  sandbox="allow-same-origin"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white"
                  style={{ width, height: 2600, transform: `scale(${k})` }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
