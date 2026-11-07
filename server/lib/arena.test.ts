// The holdout seal, the pass-rate arithmetic and the token guard, tested as
// pure functions. The database module is stubbed: nothing here touches SQL.
import { describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({ getDb: () => ({}), schema: {} }));

import {
  ALL_WIDTHS,
  FINDING_RULES,
  type Finding,
  type FindingRule,
  HOLDOUT_WIDTHS,
  PUBLIC_WIDTHS,
  holdoutRegressions,
  isHoldoutWidth,
} from "../../shared/arena-protocol";
import { effectiveCss, parseFindings, parseTokens, redactHoldout, summarize, validateTokens, verdictsFor } from "./arena";
import { applySaboteur, DEFAULT_CHAOS_CASES } from "./saboteur";
import { SEED_COMPONENTS } from "./seed-components";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const finding = (width: number, rule: FindingRule, overflow = 12, selector = ".x"): Finding => ({
  width,
  selector,
  rect: { x: 0, y: 0, w: 10, h: 10 },
  overflow_px: overflow,
  rule,
  detail: "",
});

function randomFindings(seed: number, count = 60): Finding[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) =>
    finding(ALL_WIDTHS[Math.floor(r() * ALL_WIDTHS.length)]!, FINDING_RULES[Math.floor(r() * FINDING_RULES.length)]!, Math.round(r() * 40), `.el-${i}`),
  );
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe("holdout seal", () => {
  it("removes every finding measured at a sealed width and keeps every public one", () => {
    for (const seed of SEEDS) {
      const all = randomFindings(seed);
      const visible = redactHoldout(all);
      expect(visible.some((f) => isHoldoutWidth(f.width))).toBe(false);
      expect(visible).toEqual(all.filter((f) => !isHoldoutWidth(f.width)));
    }
  });

  it("leaks no selector that appears only at a sealed width", () => {
    const all = [finding(347, "escapes-viewport", 20, ".secret"), finding(320, "clipped-content", 4, ".public")];
    expect(JSON.stringify(redactHoldout(all))).not.toContain(".secret");
  });

  it("still reports a pass/fail verdict per sealed lane", () => {
    const all = [finding(513, "aabb-collision"), finding(320, "contrast")];
    const holdoutLanes = verdictsFor([...HOLDOUT_WIDTHS], all);
    expect(holdoutLanes.map((v) => [v.width, v.pass])).toEqual([
      [347, true],
      [513, false],
      [701, true],
      [991, true],
      [1153, true],
    ]);
    expect(holdoutLanes.every((v) => v.holdout)).toBe(true);
  });

  it("blocks the gate on overflow or collision at a sealed width, never on public widths", () => {
    for (const seed of SEEDS) {
      for (const f of holdoutRegressions(randomFindings(seed))) {
        expect(isHoldoutWidth(f.width)).toBe(true);
        expect(f.rule).not.toBe("contrast");
        expect(f.rule).not.toBe("target-undersize");
      }
    }
  });
});

describe("lane verdicts and pass rates", () => {
  it("fails a lane only on failing rules; small touch targets are advisory", () => {
    const v = verdictsFor([320, 360], [finding(320, "target-undersize"), finding(360, "contrast")]);
    expect(v).toEqual([
      { width: 320, pass: true, failing: 0, holdout: false },
      { width: 360, pass: false, failing: 1, holdout: false },
    ]);
  });

  it("gives 100% to a clean component and splits public from sealed rates", () => {
    const clean = summarize([...ALL_WIDTHS], []);
    expect(clean.publicPassRate).toBe(100);
    expect(clean.holdoutPassRate).toBe(100);

    const s = summarize([...ALL_WIDTHS], [finding(320, "escapes-viewport"), finding(347, "aabb-collision")]);
    expect(s.publicPassRate).toBe(Math.round((27 / 28) * 1000) / 10);
    expect(s.holdoutPassRate).toBe(80);
    expect(s.overflowCount).toBe(1);
    expect(s.collisionCount).toBe(1);
  });

  it("keeps rates in [0, 100] and counts each lane once however many findings it has", () => {
    for (const seed of SEEDS) {
      const s = summarize([...ALL_WIDTHS], randomFindings(seed, 200));
      for (const rate of [s.publicPassRate!, s.holdoutPassRate!]) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(100);
      }
      expect(s.verdicts).toHaveLength(ALL_WIDTHS.length);
    }
  });

  it("returns no rate for a run that measured no lanes of that kind", () => {
    const publicOnly = summarize([...PUBLIC_WIDTHS], []);
    expect(publicOnly.holdoutPassRate).toBeNull();
    expect(summarize([...HOLDOUT_WIDTHS], []).publicPassRate).toBeNull();
  });

  it("reads stored findings defensively", () => {
    expect(parseFindings("not json")).toEqual([]);
    expect(parseFindings("{}")).toEqual([]);
    expect(parseFindings(JSON.stringify([finding(320, "contrast")]))).toHaveLength(1);
  });
});

describe("design tokens", () => {
  it("keeps only string-valued tokens and survives bad JSON", () => {
    expect(parseTokens('{"--gap":"1rem","--n":3,"--x":null}')).toEqual({ "--gap": "1rem" });
    expect(parseTokens("[1,2]")).toEqual({});
    expect(parseTokens("{oops")).toEqual({});
  });

  it("accepts CSS custom properties with plain values", () => {
    expect(() => validateTokens({ "--space-gap": "1.5rem", "--accent": "#1f6feb", "--w": "min(100%, 40ch)" })).not.toThrow();
  });

  it("refuses names that are not custom properties and values that could escape the declaration", () => {
    expect(() => validateTokens({ color: "red" })).toThrow();
    expect(() => validateTokens({ "--x": "red; } body { display: none" })).toThrow();
    expect(() => validateTokens({ "--x": "</style><script>" })).toThrow();
  });

  it("emits tokens as a :root block ahead of the component CSS", () => {
    expect(effectiveCss('{"--gap":"2px"}', ".a{gap:var(--gap)}")).toBe(":root {\n  --gap: 2px;\n}\n.a{gap:var(--gap)}");
    expect(effectiveCss("{}", ".a{}")).toBe(".a{}");
  });
});

describe("saboteur on the seeded components", () => {
  const tags = (html: string) => (html.match(/<\/?[a-zA-Z][^>]*>/g) ?? []).map((t) => t.replace(/\s.*$/, "").replace(/>$/, ""));

  it("never rewrites markup structure while stressing text, for every profile and component", () => {
    for (const c of SEED_COMPONENTS) {
      for (const { spec } of DEFAULT_CHAOS_CASES) {
        if (spec.kind === "payload-extremes") continue; // empties lists and drops optional fields by design
        expect(tags(applySaboteur(c.html, spec).html)).toEqual(tags(c.html));
      }
    }
  });

  it("is deterministic for every profile and component", () => {
    for (const c of SEED_COMPONENTS) {
      for (const { spec } of DEFAULT_CHAOS_CASES) expect(applySaboteur(c.html, spec)).toEqual(applySaboteur(c.html, spec));
    }
  });

  it("lengthens text under German expansion and keeps it under RTL and font scaling", () => {
    for (const c of SEED_COMPONENTS) {
      const [de, rtl, , scale] = DEFAULT_CHAOS_CASES.map((x) => applySaboteur(c.html, x.spec));
      expect(de!.report.charsAfter).toBeGreaterThan(de!.report.charsBefore);
      expect(rtl!.html).toBe(applySaboteur(c.html, null).html);
      expect(rtl!.dir).toBe("rtl");
      expect(scale!.rootFontScale).toBe(2);
    }
  });
});
