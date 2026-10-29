// The measurement protocol shared by the browser engine and the server gate.
// These are harness constants (which widths get measured), not evaluation data.

export const PUBLIC_WIDTHS = [
  320, 360, 375, 390, 412, 428, 480, 540, 600, 640, 720, 768, 800, 834, 900,
  1024, 1080, 1180, 1280, 1366, 1440, 1536, 1600, 1680, 1728, 1792, 1856, 1920,
] as const;

export const HOLDOUT_WIDTHS = [347, 513, 701, 991, 1153] as const;

export const ALL_WIDTHS: readonly number[] = [
  ...PUBLIC_WIDTHS,
  ...HOLDOUT_WIDTHS,
].sort((a, b) => a - b);

export const MIN_WIDTH = 320;
export const MAX_WIDTH = 1920;

export const isHoldoutWidth = (width: number): boolean =>
  (HOLDOUT_WIDTHS as readonly number[]).includes(width);

export const RUN_MODES = ["public_28", "holdout_5", "full_33"] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const widthsForMode = (mode: RunMode): number[] => {
  if (mode === "public_28") return [...PUBLIC_WIDTHS];
  if (mode === "holdout_5") return [...HOLDOUT_WIDTHS];
  return [...ALL_WIDTHS];
};

export const SABOTEUR_PROFILES = [
  "none",
  "i18n-expansion",
  "rtl-mirror",
  "payload-extremes",
  "font-scale-200",
] as const;
export type SaboteurProfile = (typeof SABOTEUR_PROFILES)[number];

// Rules that make a width fail. `target-undersize` is advisory only.
export const FINDING_RULES = [
  "page-overflow-x",
  "escapes-viewport",
  "clipped-content",
  "aabb-collision",
  "target-crowding",
  "contrast",
  "target-undersize",
] as const;
export type FindingRule = (typeof FINDING_RULES)[number];

export const FAILING_RULES: readonly FindingRule[] = [
  "page-overflow-x",
  "escapes-viewport",
  "clipped-content",
  "aabb-collision",
  "target-crowding",
  "contrast",
];

export const OVERFLOW_RULES: readonly FindingRule[] = [
  "page-overflow-x",
  "escapes-viewport",
  "clipped-content",
];
export const COLLISION_RULES: readonly FindingRule[] = [
  "aabb-collision",
  "target-crowding",
];

export type Rect = { x: number; y: number; w: number; h: number };

export type Finding = {
  width: number;
  selector: string;
  rect: Rect;
  overflow_px: number;
  rule: FindingRule;
  detail: string;
  otherSelector?: string | undefined;
  ratio?: number | undefined;
};

export const MIN_TARGET_PX = 44;

// The holdout gate's rule: a sealed lane regresses on any overflow or any
// collision. Contrast and advisory small-target findings never block it.
export const holdoutRegressions = (findings: Finding[]): Finding[] =>
  findings.filter(
    (f) =>
      isHoldoutWidth(f.width) &&
      ((f.overflow_px > 0 && f.rule !== "contrast" && f.rule !== "target-undersize") ||
        COLLISION_RULES.includes(f.rule)),
  );
