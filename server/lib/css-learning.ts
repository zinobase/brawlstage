import { createHash } from "node:crypto";

// Line diff (LCS), unified-diff rendering, and declaration-level CSS deltas
// used to turn a human's hand edit into a reusable layout invariant.

type Op = { kind: " " | "-" | "+"; line: string; a: number; b: number };

export const diffLines = (before: string, after: string): Op[] => {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const lcs = new Int32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + j + 1] ?? 0);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const la = a[i] ?? "";
    const lb = b[j] ?? "";
    if (la === lb) {
      ops.push({ kind: " ", line: la, a: i, b: j });
      i++;
      j++;
    } else if ((lcs[(i + 1) * width + j] ?? 0) >= (lcs[i * width + j + 1] ?? 0)) {
      ops.push({ kind: "-", line: la, a: i, b: j });
      i++;
    } else {
      ops.push({ kind: "+", line: lb, a: i, b: j });
      j++;
    }
  }
  while (i < n) ops.push({ kind: "-", line: a[i] ?? "", a: i++, b: j });
  while (j < m) ops.push({ kind: "+", line: b[j] ?? "", a: i, b: j++ });
  return ops;
};

export const unifiedDiff = (
  before: string,
  after: string,
  labels: { from: string; to: string },
  context = 3,
): string => {
  const ops = diffLines(before, after);
  const changed = ops
    .map((op, idx) => (op.kind === " " ? -1 : idx))
    .filter((idx) => idx >= 0);
  if (!changed.length) return "";
  const hunks: [number, number][] = [];
  for (const idx of changed) {
    const start = Math.max(0, idx - context);
    const end = Math.min(ops.length - 1, idx + context);
    const last = hunks[hunks.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else hunks.push([start, end]);
  }
  const out = [`--- ${labels.from}`, `+++ ${labels.to}`];
  for (const [start, end] of hunks) {
    const slice = ops.slice(start, end + 1);
    const head = slice[0];
    if (!head) continue;
    const aStart = head.a + 1;
    const bStart = head.b + 1;
    const aLen = slice.filter((o) => o.kind !== "+").length;
    const bLen = slice.filter((o) => o.kind !== "-").length;
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    for (const op of slice) out.push(`${op.kind}${op.line}`);
  }
  return out.join("\n");
};

// ---------- CSS declaration model ----------

export type DeclarationMap = Map<string, Map<string, string>>;

export const parseDeclarations = (css: string): DeclarationMap => {
  const map: DeclarationMap = new Map();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const stack: string[] = [];
  let buffer = "";
  for (const ch of clean) {
    if (ch === "{") {
      stack.push(buffer.trim().replace(/\s+/g, " "));
      buffer = "";
    } else if (ch === "}") {
      const scope = stack.join(" ⟩ ");
      const body = buffer.trim();
      if (body && scope) {
        const decls = map.get(scope) ?? new Map<string, string>();
        for (const part of body.split(";")) {
          const colon = part.indexOf(":");
          if (colon < 0) continue;
          const prop = part.slice(0, colon).trim().toLowerCase();
          const value = part.slice(colon + 1).trim().replace(/\s+/g, " ");
          if (prop) decls.set(prop, value);
        }
        map.set(scope, decls);
      }
      stack.pop();
      buffer = "";
    } else if (ch === ";" && stack.length === 0) {
      buffer = "";
    } else {
      buffer += ch;
    }
  }
  return map;
};

export type DeclarationDelta = {
  scope: string;
  prop: string;
  before: string | null;
  after: string | null;
};

export const declarationDeltas = (
  before: string,
  after: string,
): DeclarationDelta[] => {
  const a = parseDeclarations(before);
  const b = parseDeclarations(after);
  const scopes = new Set([...a.keys(), ...b.keys()]);
  const deltas: DeclarationDelta[] = [];
  for (const scope of scopes) {
    const da = a.get(scope) ?? new Map<string, string>();
    const db = b.get(scope) ?? new Map<string, string>();
    const props = new Set([...da.keys(), ...db.keys()]);
    for (const prop of props) {
      const va = da.get(prop) ?? null;
      const vb = db.get(prop) ?? null;
      if (va !== vb) deltas.push({ scope, prop, before: va, after: vb });
    }
  }
  return deltas;
};

// Named responsive patterns recognized in a delta. Each pattern is a
// deterministic predicate over the declaration change.
const PATTERNS: {
  name: string;
  test: (d: DeclarationDelta) => boolean;
  rule: string;
}[] = [
  {
    name: "wrap-instead-of-nowrap",
    test: (d) =>
      (d.prop === "flex-wrap" && d.after === "wrap") ||
      (d.prop === "white-space" && d.before === "nowrap" && d.after !== "nowrap"),
    rule: "Rows of chips, tabs, or links must be allowed to wrap; never ship `nowrap` on a row whose item count or label length is data-driven.",
  },
  {
    name: "shrinkable-flex-child",
    test: (d) =>
      (d.prop === "min-width" && (d.after === "0" || d.after === "0px")) ||
      (d.prop === "flex-shrink" && d.after !== "0"),
    rule: "Flex children that hold text need `min-width: 0` (or a shrinkable basis) so long content truncates or wraps instead of pushing siblings out.",
  },
  {
    // Turning token breaking ON where there was none.
    name: "break-long-tokens",
    test: (d) =>
      (d.prop === "overflow-wrap" &&
        /anywhere|break-word/.test(d.after ?? "") &&
        !/anywhere|break-word/.test(d.before ?? "")) ||
      (d.prop === "word-break" && /break-word/.test(d.after ?? "") && !/break/.test(d.before ?? "")),
    rule: "Text that renders user or API data must break long unspaced tokens (`overflow-wrap: break-word`).",
  },
  {
    // Turning aggressive breaking DOWN: words were being split mid-word.
    name: "no-mid-word-breaks",
    test: (d) =>
      (d.prop === "overflow-wrap" && /anywhere/.test(d.before ?? "") && !/anywhere/.test(d.after ?? "")) ||
      (d.prop === "word-break" && /break-all/.test(d.before ?? "") && !/break-all/.test(d.after ?? "")),
    rule: "Never let ordinary words split mid-word: use `overflow-wrap: break-word` (it only splits a word too long for a line on its own), not `overflow-wrap: anywhere` or `word-break: break-all`, on headings, names and prices.",
  },
  {
    name: "fluid-grid-tracks",
    test: (d) =>
      d.prop === "grid-template-columns" &&
      /(minmax|auto-fit|auto-fill|fr)/.test(d.after ?? "") &&
      !/(minmax|auto-fit|auto-fill)/.test(d.before ?? ""),
    rule: "Grid tracks must be fluid (`minmax(0, 1fr)`, `auto-fit`) rather than fixed pixel tracks that sum past narrow viewports.",
  },
  {
    name: "remove-fixed-width",
    test: (d) =>
      (d.prop === "width" || d.prop === "min-width") &&
      /^\d+(\.\d+)?px$/.test(d.before ?? "") &&
      d.after !== d.before,
    rule: "Avoid fixed pixel widths on components that live in fluid containers; prefer max-width or clamp().",
  },
  {
    name: "logical-properties",
    test: (d) =>
      /^(margin|padding|inset)-(inline|block)/.test(d.prop) ||
      /^(margin|padding)-(left|right)$/.test(d.prop) && d.after === null,
    rule: "Use logical properties (`margin-inline-start`, `padding-inline`) so the layout mirrors correctly under `dir=rtl`.",
  },
  {
    name: "contrast-repair",
    test: (d) => d.prop === "color" || d.prop.startsWith("--") && /(text|ink|muted|fg)/.test(d.prop),
    rule: "Text colors must keep a 4.5:1 WCAG contrast ratio against the composited background (3:1 for large text).",
  },
  {
    name: "touch-target-size",
    test: (d) =>
      /^(min-)?(height|width|block-size|inline-size)$/.test(d.prop) &&
      parseFloat(d.after ?? "0") >= 44 &&
      parseFloat(d.before ?? "0") < 44,
    rule: "Interactive targets must be at least 44×44px or spaced so their 44px hit zones do not touch.",
  },
  {
    name: "gap-instead-of-negative-margin",
    test: (d) =>
      (d.prop.startsWith("margin") && /^-/.test(d.before ?? "") && !/^-/.test(d.after ?? "")) ||
      (d.prop === "gap" && d.after !== null),
    rule: "Space siblings with `gap` rather than negative margins; negative offsets collide at intermediate widths.",
  },
];

export const extractInvariant = (
  deltas: DeclarationDelta[],
): { patterns: string[]; text: string } => {
  const matched = new Map<string, string>();
  for (const d of deltas) {
    for (const p of PATTERNS) {
      if (p.test(d) && !matched.has(p.name)) matched.set(p.name, p.rule);
    }
  }
  const evidence = deltas
    .slice(0, 12)
    .map(
      (d) =>
        `- \`${d.scope}\` → \`${d.prop}\`: ${d.before === null ? "(unset)" : `\`${d.before}\``} ⇒ ${d.after === null ? "(removed)" : `\`${d.after}\``}`,
    );
  const rules = [...matched.values()];
  const text = [
    ...(rules.length
      ? rules.map((r) => `- ${r}`)
      : ["- Prefer the human's declaration values below over the agent's draft for these selectors."]),
    "",
    "Evidence (human hand edit over agent draft):",
    ...evidence,
  ].join("\n");
  return { patterns: [...matched.keys()], text };
};

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
