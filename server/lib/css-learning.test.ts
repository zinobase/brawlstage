import { describe, expect, it } from "vitest";

import { declarationDeltas, diffLines, extractInvariant, sha256, unifiedDiff } from "./css-learning";

const agent = `.title {
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row { display: flex; }`;

const human = `.title {
  margin: 0;
  white-space: normal;
  min-width: 0;
}
.row { display: flex; }`;

describe("line diff", () => {
  it("keeps shared lines and marks only real changes", () => {
    const ops = diffLines(agent, human);
    expect(ops.filter((o) => o.kind === " ").map((o) => o.line)).toContain("  margin: 0;");
    expect(ops.filter((o) => o.kind === "-")).toHaveLength(3);
    expect(ops.filter((o) => o.kind === "+")).toHaveLength(2);
  });

  it("renders a unified diff with a hunk header", () => {
    const diff = unifiedDiff(agent, human, { from: "a.css", to: "b.css" });
    expect(diff.split("\n").slice(0, 2)).toEqual(["--- a.css", "+++ b.css"]);
    expect(diff).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
    expect(diff).toContain("-  white-space: nowrap;");
    expect(diff).toContain("+  white-space: normal;");
  });

  it("returns nothing for identical input", () => {
    expect(unifiedDiff(agent, agent, { from: "a", to: "b" })).toBe("");
  });
});

describe("declaration deltas and invariants", () => {
  it("finds changed, added and removed declarations per selector", () => {
    const deltas = declarationDeltas(agent, human);
    expect(deltas).toContainEqual({ scope: ".title", prop: "white-space", before: "nowrap", after: "normal" });
    expect(deltas).toContainEqual({ scope: ".title", prop: "min-width", before: null, after: "0" });
    expect(deltas).toContainEqual({ scope: ".title", prop: "overflow", before: "hidden", after: null });
    expect(deltas.some((d) => d.scope === ".row")).toBe(false);
  });

  it("recognises the responsive patterns behind the edit", () => {
    const { patterns, text } = extractInvariant(declarationDeltas(agent, human));
    expect(patterns).toEqual(expect.arrayContaining(["wrap-instead-of-nowrap", "shrinkable-flex-child"]));
    expect(text).toContain("`.title` → `white-space`");
  });

  it("scopes declarations inside media queries", () => {
    const deltas = declarationDeltas(
      "@media (max-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } }",
      "@media (max-width: 640px) { .grid { grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); } }",
    );
    expect(deltas[0]?.scope).toBe("@media (max-width: 640px) ⟩ .grid");
    expect(extractInvariant(deltas).patterns).toContain("fluid-grid-tracks");
  });
});

describe("sha256", () => {
  it("matches the known digest", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("pattern direction", () => {
  it("learns 'no mid-word breaks' when a person turns overflow-wrap: anywhere down to break-word", () => {
    const deltas = declarationDeltas(".tier { overflow-wrap: anywhere; }", ".tier { overflow-wrap: break-word; }");
    const { patterns, text } = extractInvariant(deltas);
    expect(patterns).toEqual(["no-mid-word-breaks"]);
    expect(text).toContain("not `overflow-wrap: anywhere`");
  });

  it("learns 'break long tokens' only when breaking is newly turned on", () => {
    expect(extractInvariant(declarationDeltas(".row { color: red; }", ".row { color: red; overflow-wrap: break-word; }")).patterns).toEqual(["break-long-tokens"]);
    expect(extractInvariant(declarationDeltas(".row { overflow-wrap: break-word; }", ".row { overflow-wrap: anywhere; }")).patterns).not.toContain("break-long-tokens");
  });
});

