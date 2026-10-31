import {
  type Finding,
  type Rect,
  FAILING_RULES,
  MIN_TARGET_PX,
} from "@shared/arena-protocol";

// Real DOM measurement engine. Everything here reads live layout from a
// same-origin sandboxed iframe: getBoundingClientRect, scroll/client sizes,
// Range client rects, and computed colors. Nothing is estimated.

export type StageDocument = {
  html: string;
  css: string;
  dir: "ltr" | "rtl";
  lang: string;
  rootFontScale: number;
};

export const ROOT_ID = "bs-root";

const HARNESS_CSS = `html{scrollbar-width:none;-webkit-text-size-adjust:100%}html::-webkit-scrollbar{display:none}body{margin:0}`;

export const buildSrcDoc = (doc: StageDocument): string => {
  const scale =
    doc.rootFontScale && doc.rootFontScale !== 1
      ? `html{font-size:${Math.round(doc.rootFontScale * 100)}%}`
      : "";
  return `<!doctype html><html lang="${escapeAttr(doc.lang)}" dir="${doc.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${HARNESS_CSS}</style><style>${doc.css.replace(/<\/style/gi, "<\\/style")}</style><style>${scale}</style></head><body><div id="${ROOT_ID}">${doc.html}</div></body></html>`;
};

const escapeAttr = (value: string): string =>
  value.replace(/[^a-zA-Z0-9-]/g, "");

// ---------- color + WCAG 2.1 relative luminance ----------

type Rgba = { r: number; g: number; b: number; a: number };

let colorCtx: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, Rgba>();

const parseColor = (value: string): Rgba => {
  const cached = colorCache.get(value);
  if (cached) return cached;
  if (!colorCtx) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorCtx = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorCtx;
  let rgba: Rgba = { r: 0, g: 0, b: 0, a: 0 };
  if (ctx) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    rgba = { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: (data[3] ?? 0) / 255 };
  }
  colorCache.set(value, rgba);
  return rgba;
};

const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) =>
    (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
};

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export const relativeLuminance = (c: Rgba): number =>
  0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

export const contrastRatio = (a: Rgba, b: Rgba): number => {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

// ---------- geometry ----------

const toRect = (r: DOMRect | DOMRectReadOnly): Rect => ({
  x: round(r.left),
  y: round(r.top),
  w: round(r.width),
  h: round(r.height),
});

const round = (n: number): number => Math.round(n * 10) / 10;

export const intersect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  if (r - x <= 1 || btm - y <= 1) return null;
  return { x: round(x), y: round(y), w: round(r - x), h: round(btm - y) };
};

// ---------- selectors ----------

export const selectorFor = (el: Element, root: Element): string => {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const tag = node.tagName.toLowerCase();
    const classes = Array.from(node.classList).slice(0, 2);
    let part = tag + classes.map((c) => `.${CSS.escape(c)}`).join("");
    const parent: Element | null = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === node!.tagName,
      );
      const matching = sameTag.filter((c) => c.matches(part));
      if (matching.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ") || "#bs-root";
};

// ---------- the measurement pass ----------

const INTERACTIVE =
  "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[tabindex]:not([tabindex='-1'])";

const hasDirectText = (el: Element): boolean =>
  Array.from(el.childNodes).some(
    (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
  );

const isVisible = (el: Element, cs: CSSStyleDeclaration): boolean => {
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  if (Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

const paintsBox = (cs: CSSStyleDeclaration): boolean =>
  parseColor(cs.backgroundColor).a > 0.05 ||
  (parseFloat(cs.borderTopWidth) > 0 &&
    parseColor(cs.borderTopColor).a > 0.05);

const textLineRects = (el: Element, doc: Document): Rect[] => {
  const range = doc.createRange();
  const rects: Rect[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== 3 || !(node.textContent ?? "").trim()) continue;
    range.selectNodeContents(node);
    for (const r of Array.from(range.getClientRects())) {
      if (r.width > 0.5 && r.height > 0.5) rects.push(toRect(r));
    }
  }
  return rects;
};

const clipRectFor = (el: Element, win: Window): Rect | null => {
  let node = el.parentElement;
  while (node && node.id !== ROOT_ID) {
    const cs = win.getComputedStyle(node);
    if (/(hidden|clip|auto|scroll)/.test(cs.overflowX + cs.overflowY)) {
      return toRect(node.getBoundingClientRect());
    }
    node = node.parentElement;
  }
  return null;
};

const backgroundBehind = (el: Element, win: Window): Rgba => {
  const chain: Rgba[] = [];
  let node: Element | null = el;
  while (node) {
    const bg = parseColor(win.getComputedStyle(node).backgroundColor);
    if (bg.a > 0) chain.push(bg);
    node = node.parentElement;
  }
  let acc: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of [...chain].reverse()) acc = over(layer, acc);
  return acc;
};

type Candidate = { el: Element; rects: Rect[]; interactive: boolean };

export const measureDocument = (
  iframe: HTMLIFrameElement,
  width: number,
): Finding[] => {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) return [];
  const root = doc.getElementById(ROOT_ID);
  if (!root) return [];
  const vw = doc.documentElement.clientWidth;
  const findings: Finding[] = [];

  // 1. page-level horizontal overflow: scrollWidth > clientWidth
  const pageOverflow = doc.documentElement.scrollWidth - vw;
  if (pageOverflow > 0.5) {
    findings.push({
      width,
      selector: "html",
      rect: { x: vw, y: 0, w: round(pageOverflow), h: doc.documentElement.scrollHeight },
      overflow_px: round(pageOverflow),
      rule: "page-overflow-x",
      detail: `Document scrolls ${round(pageOverflow)}px past a ${vw}px viewport`,
    });
  }

  const elements = Array.from(root.querySelectorAll("*"));
  const styles = new Map<Element, CSSStyleDeclaration>();
  const visible: Element[] = [];
  for (const el of elements) {
    const cs = win.getComputedStyle(el);
    styles.set(el, cs);
    if (isVisible(el, cs)) visible.push(el);
  }

  // 2. elements whose border box escapes the viewport (outermost only)
  const escaped = new Set<Element>();
  for (const el of visible) {
    const r = el.getBoundingClientRect();
    const past = Math.max(r.right - vw, -r.left);
    if (past <= 0.5) continue;
    let ancestor = el.parentElement;
    let covered = false;
    while (ancestor && ancestor !== root) {
      if (escaped.has(ancestor)) {
        covered = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    escaped.add(el);
    if (covered) continue;
    findings.push({
      width,
      selector: selectorFor(el, root),
      rect: toRect(r),
      overflow_px: round(past),
      rule: "escapes-viewport",
      detail: `Box extends ${round(past)}px outside the ${vw}px viewport`,
    });
  }

  // 3. content overflowing its own box: scrollWidth > clientWidth,
  //    scrollHeight > clientHeight (clipped or spilling). Deepest origin wins.
  const overflowOrigins: { el: Element; right: number; bottom: number }[] = [];
  for (let i = visible.length - 1; i >= 0; i--) {
    const el = visible[i] as HTMLElement;
    if (!el) continue;
    const cs = styles.get(el)!;
    if (cs.display === "inline" || cs.display === "contents") continue;
    if (cs.textOverflow === "ellipsis") continue;
    const dx = el.scrollWidth - el.clientWidth;
    const clipsY = /(hidden|clip)/.test(cs.overflowY);
    const dy = clipsY ? el.scrollHeight - el.clientHeight : 0;
    if (dx <= 1 && dy <= 1) continue;
    const scrolls = /(auto|scroll)/.test(cs.overflowX) && dx > 1 && dy <= 1;
    if (scrolls) continue; // intentional scroll container
    const r = el.getBoundingClientRect();
    const right = r.left + el.clientLeft + el.scrollWidth;
    const bottom = r.top + el.clientTop + el.scrollHeight;
    const sameOverflow = overflowOrigins.some(
      (o) => el.contains(o.el) && o.right >= right - 1 && (dy <= 1 || o.bottom >= bottom - 1),
    );
    if (sameOverflow) continue;
    overflowOrigins.push({ el, right, bottom });
    const clipped = /(hidden|clip)/.test(cs.overflowX) || clipsY;
    const amount = round(Math.max(dx, dy));
    findings.push({
      width,
      selector: selectorFor(el, root),
      rect: toRect(r),
      overflow_px: amount,
      rule: "clipped-content",
      detail: clipped
        ? `Content clipped by ${amount}px (${dx > 1 ? "horizontal" : "vertical"})`
        : `Content spills ${amount}px past its ${round(el.clientWidth)}px box`,
    });
  }

  // 4. AABB collisions between painted boxes, text line boxes and targets
  const candidates: Candidate[] = [];
  for (const el of visible) {
    const cs = styles.get(el)!;
    if (el.closest("[data-bs-allow-overlap]")) continue;
    const interactive = el.matches(INTERACTIVE);
    let rects: Rect[] = [];
    if (interactive || paintsBox(cs) || el.matches("img,svg,video,canvas")) {
      rects = [toRect(el.getBoundingClientRect())];
    } else if (hasDirectText(el)) {
      rects = textLineRects(el, doc);
    }
    if (!rects.length) continue;
    const clip = clipRectFor(el, win);
    if (clip) {
      rects = rects
        .map((r) => intersect(r, clip))
        .filter((r): r is Rect => r !== null);
    }
    if (rects.length) candidates.push({ el, rects, interactive });
  }
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      let hit: Rect | null = null;
      for (const ra of a.rects) {
        for (const rb of b.rects) {
          hit = intersect(ra, rb);
          if (hit) break;
        }
        if (hit) break;
      }
      if (!hit) continue;
      findings.push({
        width,
        selector: selectorFor(a.el, root),
        otherSelector: selectorFor(b.el, root),
        rect: hit,
        overflow_px: round(Math.min(hit.w, hit.h)),
        rule: "aabb-collision",
        detail: `Overlaps ${selectorFor(b.el, root)} by ${hit.w}×${hit.h}px`,
      });
    }
  }

  // 5. interactive targets under 44px whose 44×44 hit area crowds another
  const targets = candidates.filter(
    (c) => c.interactive && styles.get(c.el)!.display !== "inline",
  );
  for (const t of targets) {
    const box = toRect(t.el.getBoundingClientRect());
    if (box.w >= MIN_TARGET_PX && box.h >= MIN_TARGET_PX) continue;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const zone: Rect = {
      x: cx - Math.max(box.w, MIN_TARGET_PX) / 2,
      y: cy - Math.max(box.h, MIN_TARGET_PX) / 2,
      w: Math.max(box.w, MIN_TARGET_PX),
      h: Math.max(box.h, MIN_TARGET_PX),
    };
    const neighbor = targets.find(
      (o) =>
        o !== t &&
        !o.el.contains(t.el) &&
        !t.el.contains(o.el) &&
        intersect(zone, toRect(o.el.getBoundingClientRect())),
    );
    if (neighbor) {
      findings.push({
        width,
        selector: selectorFor(t.el, root),
        otherSelector: selectorFor(neighbor.el, root),
        rect: box,
        overflow_px: round(MIN_TARGET_PX - Math.min(box.w, box.h)),
        rule: "target-crowding",
        detail: `${box.w}×${box.h}px target's 44px zone touches ${selectorFor(neighbor.el, root)}`,
      });
    } else {
      findings.push({
        width,
        selector: selectorFor(t.el, root),
        rect: box,
        overflow_px: round(MIN_TARGET_PX - Math.min(box.w, box.h)),
        rule: "target-undersize",
        detail: `Target is ${box.w}×${box.h}px (under 44px)`,
      });
    }
  }

  // 6. WCAG 2.1 contrast: (L1 + 0.05) / (L2 + 0.05) on composited colors
  for (const el of visible) {
    if (!hasDirectText(el) || el.closest("[aria-hidden=true]")) continue;
    const cs = styles.get(el)!;
    const bg = backgroundBehind(el, win);
    const fg = over(parseColor(cs.color), bg);
    const ratio = contrastRatio(fg, bg);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const required = large ? 3 : 4.5;
    if (ratio + 1e-6 >= required) continue;
    findings.push({
      width,
      selector: selectorFor(el, root),
      rect: toRect(el.getBoundingClientRect()),
      overflow_px: 0,
      rule: "contrast",
      ratio: Math.round(ratio * 100) / 100,
      detail: `Contrast ${ratio.toFixed(2)}:1 is below ${required}:1 (${round(size)}px${bold ? " bold" : ""})`,
    });
  }

  return findings;
};

export const widthFails = (findings: Finding[]): boolean =>
  findings.some((f) => FAILING_RULES.includes(f.rule));

// ---------- sweeping ----------

const yieldToBrowser = (): Promise<void> =>
  new Promise((resolve) => {
    // MessageChannel is not throttled in background tabs, unlike setTimeout/rAF.
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });

export const loadSrcDoc = (
  iframe: HTMLIFrameElement,
  srcdoc: string,
): Promise<void> =>
  new Promise((resolve) => {
    const done = () => {
      iframe.removeEventListener("load", done);
      resolve();
    };
    iframe.addEventListener("load", done);
    iframe.srcdoc = srcdoc;
  });

export const applyWidth = async (
  iframe: HTMLIFrameElement,
  width: number,
): Promise<void> => {
  iframe.style.width = `${width}px`;
  // Reading layout forces the parent to resize the frame and the child to
  // re-run media queries synchronously.
  void iframe.offsetWidth;
  const doc = iframe.contentDocument;
  if (doc && doc.documentElement.clientWidth !== width) {
    await yieldToBrowser();
  }
};

export type SweepResult = {
  widths: number[];
  findings: Finding[];
  durationMs: number;
};

export const sweepWidths = async (
  iframe: HTMLIFrameElement,
  srcdoc: string,
  widths: number[],
  onLane?: (width: number, findings: Finding[]) => void,
  signal?: { cancelled: boolean },
): Promise<SweepResult> => {
  const started = performance.now();
  await loadSrcDoc(iframe, srcdoc);
  const doc = iframe.contentDocument;
  if (doc?.fonts?.ready) await doc.fonts.ready;
  const all: Finding[] = [];
  for (const width of widths) {
    if (signal?.cancelled) break;
    await applyWidth(iframe, width);
    const found = measureDocument(iframe, width);
    all.push(...found);
    onLane?.(width, found);
    await yieldToBrowser();
  }
  return {
    widths,
    findings: all,
    durationMs: Math.round(performance.now() - started),
  };
};
