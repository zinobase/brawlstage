import { IconLock } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Finding } from "@shared/arena-protocol";
import type { StageInput } from "@/hooks/use-arena-sweep";
import { applyWidth, buildSrcDoc, loadSrcDoc } from "@/lib/dom-audit";
import { cn } from "@/lib/utils";

type StageViewportProps = {
  stage: StageInput;
  width: number;
  findings: Finding[];
  sealed: boolean;
  selectedSelector: string | null;
  liveTokens: Record<string, string>;
  onSelectFinding: (selector: string | null) => void;
};

const RULE_TONE: Record<string, string> = {
  contrast: "border-[hsl(var(--bs-caution))] bg-[hsl(var(--bs-caution)/0.12)]",
  "target-undersize": "border-dashed border-muted-foreground/70 bg-transparent",
};

export const StageViewport = ({
  stage,
  width,
  findings,
  sealed,
  selectedSelector,
  liveTokens,
  onSelectFinding,
}: StageViewportProps) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(960);
  const [contentHeight, setContentHeight] = useState(320);
  const srcdoc = useMemo(() => buildSrcDoc(stage), [stage]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(Math.max(240, entry.contentRect.width - 32));
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const measureHeight = () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    setContentHeight(Math.min(2400, Math.max(48, doc.documentElement.scrollHeight)));
  };

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let alive = true;
    void loadSrcDoc(frame, srcdoc).then(async () => {
      if (!alive) return;
      await applyWidth(frame, width);
      measureHeight();
    });
    return () => {
      alive = false;
    };
    // width changes are handled below without reloading the document
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcdoc]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame?.contentDocument) return;
    void applyWidth(frame, width).then(measureHeight);
  }, [width]);

  // Live token drag: write custom properties straight onto the iframe root at
  // pointer rate. The committed value is persisted on release.
  useEffect(() => {
    const root = frameRef.current?.contentDocument?.documentElement;
    if (!root) return;
    for (const [name, value] of Object.entries(liveTokens)) {
      root.style.setProperty(name, value);
    }
    measureHeight();
  }, [liveTokens]);

  const scale = Math.min(1, available / width);
  const scaledHeight = contentHeight * scale;

  return (
    <div ref={shellRef} className="bs-ring-floor relative flex min-h-[440px] flex-1 flex-col items-center overflow-auto px-4 py-6 lg:min-h-0">
      <div className="mb-2 flex w-full items-center justify-between font-mono-num text-[11px] text-muted-foreground" style={{ maxWidth: width * scale }}>
        <span>0</span>
        <span className="text-[hsl(var(--bs-caution))]">
          {width}px{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
        </span>
        <span>{width}</span>
      </div>
      <div
        className="bs-floodlight relative shrink-0 bg-white"
        style={{ width: width * scale, height: scaledHeight }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width,
            height: contentHeight,
            transform: `translate3d(0,0,0) scale(${scale})`,
            willChange: "transform",
          }}
        >
          <iframe
            ref={frameRef}
            title="Component stage"
            sandbox="allow-same-origin"
            className="block border-0 bg-white"
            style={{ width, height: contentHeight }}
          />
          {!sealed
            ? findings.map((f, index) => {
                const selected = f.selector === selectedSelector;
                return (
                  <button
                    key={`${f.rule}-${f.selector}-${index}`}
                    type="button"
                    aria-label={`${f.rule} on ${f.selector}`}
                    onClick={() => onSelectFinding(selected ? null : f.selector)}
                    className={cn(
                      "absolute border-2 border-[hsl(var(--bs-knockdown))] bg-[hsl(var(--bs-knockdown)/0.1)] outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
                      RULE_TONE[f.rule],
                      selected
                        ? "z-10 border-[3px] border-[hsl(var(--bs-caution))] bg-[hsl(var(--bs-caution)/0.18)] opacity-100"
                        : "opacity-80",
                    )}
                    style={{
                      left: Math.max(0, f.rect.x),
                      top: Math.max(0, f.rect.y),
                      width: Math.max(6, Math.min(f.rect.w, width * 3)),
                      height: Math.max(6, f.rect.h),
                    }}
                  />
                );
              })
            : null}
        </div>
        {sealed ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1.5 bg-[hsl(var(--bs-caution-ink)/0.85)] px-2 py-1 font-display text-[11px] text-[hsl(var(--bs-caution))]">
            <IconLock className="size-3" aria-hidden="true" />
            Sealed holdout lane — findings hidden from every surface
          </div>
        ) : null}
      </div>
    </div>
  );
};
