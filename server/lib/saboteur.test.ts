import { describe, expect, it } from "vitest";

import { applySaboteur, DEFAULT_CHAOS_CASES, fnv1a, type TransformSpec } from "./saboteur";

const specOf = (kind: TransformSpec["kind"]): TransformSpec =>
  DEFAULT_CHAOS_CASES.find((c) => c.spec.kind === kind)!.spec;

const html = `<nav class="x"><a href="#">Shipments overview</a><ul><li>One</li><li>Two</li></ul><p data-optional>Optional footnote</p><span>Total 12,480.00</span></nav>`;

describe("applySaboteur", () => {
  it("leaves markup untouched when disarmed", () => {
    const out = applySaboteur(html, null);
    expect(out.html).toBe(html);
    expect(out.dir).toBe("ltr");
    expect(out.rootFontScale).toBe(1);
  });

  it("expands text by roughly 40% without touching tags", () => {
    const out = applySaboteur(html, specOf("i18n-expansion"));
    const growth = out.report.charsAfter / out.report.charsBefore;
    expect(growth).toBeGreaterThan(1.3);
    expect(growth).toBeLessThan(1.45);
    expect(out.html).toContain('<a href="#">');
    expect(out.html).toContain("data-optional");
    expect(out.lang).toBe("de");
  });

  it("is deterministic: the same input always produces the same stress", () => {
    const a = applySaboteur(html, specOf("payload-extremes"));
    const b = applySaboteur(html, specOf("payload-extremes"));
    expect(a.html).toBe(b.html);
  });

  it("injects 120-character unspaced tokens, empties lists and drops optional fields", () => {
    const out = applySaboteur(html, specOf("payload-extremes"));
    expect(out.report.longTokensInjected).toBeGreaterThan(0);
    expect(out.html).toMatch(/[A-Za-z0-9]{120}/);
    expect(out.html).toContain("<ul></ul>");
    expect(out.html).not.toContain("Optional footnote");
    expect(out.report.listsEmptied).toBe(1);
    expect(out.report.optionalDropped).toBe(1);
    expect(out.report.numbersReplaced).toBeGreaterThan(0);
  });

  it("mirrors to RTL and scales the root font without rewriting text", () => {
    expect(applySaboteur(html, specOf("rtl-mirror"))).toMatchObject({ html, dir: "rtl", lang: "ar" });
    expect(applySaboteur(html, specOf("font-scale-200"))).toMatchObject({ html, rootFontScale: 2 });
  });

  it("uses a stable FNV-1a hash", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("brawl")).toBe(fnv1a("brawl"));
    expect(fnv1a("brawl")).not.toBe(fnv1a("brawn"));
  });
});
