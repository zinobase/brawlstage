import { describe, expect, it } from "vitest";

import { ALL_WIDTHS, HOLDOUT_WIDTHS, holdoutRegressions, PUBLIC_WIDTHS, widthsForMode } from "@shared/arena-protocol";

import { buildSrcDoc, contrastRatio, intersect, relativeLuminance } from "./dom-audit";

const rgb = (r: number, g: number, b: number) => ({ r, g, b, a: 1 });

describe("WCAG 2.1 contrast", () => {
  it("gives 21:1 for black on white and 1:1 for equal colors", () => {
    expect(contrastRatio(rgb(0, 0, 0), rgb(255, 255, 255))).toBeCloseTo(21, 5);
    expect(contrastRatio(rgb(120, 120, 120), rgb(120, 120, 120))).toBeCloseTo(1, 5);
  });

  it("is symmetric and matches published reference values", () => {
    const a = contrastRatio(rgb(118, 118, 118), rgb(255, 255, 255));
    expect(a).toBeCloseTo(contrastRatio(rgb(255, 255, 255), rgb(118, 118, 118)), 10);
    // #767676 on white is the classic 4.54:1 AA threshold gray.
    expect(a).toBeCloseTo(4.54, 2);
  });

  it("computes relative luminance with the sRGB transfer curve", () => {
    expect(relativeLuminance(rgb(255, 255, 255))).toBeCloseTo(1, 10);
    expect(relativeLuminance(rgb(0, 0, 0))).toBe(0);
  });
});

describe("AABB intersection", () => {
  it("returns the overlap box", () => {
    expect(intersect({ x: 0, y: 0, w: 100, h: 40 }, { x: 80, y: 30, w: 50, h: 50 })).toEqual({ x: 80, y: 30, w: 20, h: 10 });
  });

  it("ignores boxes that only touch or overlap by a pixel", () => {
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBeNull();
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 10, h: 10 })).toBeNull();
  });
});

describe("measurement protocol", () => {
  it("measures 28 public and 5 sealed holdout widths, all distinct and in range", () => {
    expect(PUBLIC_WIDTHS).toHaveLength(28);
    expect(HOLDOUT_WIDTHS).toEqual([347, 513, 701, 991, 1153]);
    expect(new Set(ALL_WIDTHS).size).toBe(33);
    expect(Math.min(...ALL_WIDTHS)).toBe(320);
    expect(Math.max(...ALL_WIDTHS)).toBe(1920);
    expect(widthsForMode("holdout_5")).toEqual([...HOLDOUT_WIDTHS]);
  });

  it("builds a stage document that cannot break out of its style block", () => {
    const doc = buildSrcDoc({ html: "<p>x</p>", css: "p{color:red}</style><script>alert(1)</script>", dir: "rtl", lang: "ar", rootFontScale: 2 });
    expect(doc).toContain('dir="rtl"');
    expect(doc).toContain("html{font-size:200%}");
    expect(doc).not.toContain("</style><script>");
  });
});

describe("holdout gate rule", () => {
  const base = { selector: "div", rect: { x: 0, y: 0, w: 10, h: 10 }, detail: "" };

  it("blocks on overflow or collision at a sealed width", () => {
    const found = holdoutRegressions([
      { ...base, width: 513, rule: "escapes-viewport", overflow_px: 12 },
      { ...base, width: 701, rule: "aabb-collision", overflow_px: 3 },
    ]);
    expect(found.map((f) => f.width)).toEqual([513, 701]);
  });

  it("ignores public widths, contrast and advisory small targets", () => {
    expect(
      holdoutRegressions([
        { ...base, width: 375, rule: "page-overflow-x", overflow_px: 40 },
        { ...base, width: 991, rule: "contrast", overflow_px: 0, ratio: 2.9 },
        { ...base, width: 1153, rule: "target-undersize", overflow_px: 14 },
      ]),
    ).toEqual([]);
  });
});
