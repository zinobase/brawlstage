import { z } from "zod";

// Deterministic chaos mutations. Each transform is a pure function of the
// component markup and the transform spec stored in `chaos_cases`, so the same
// inputs always produce the same stressed document.

export const transformSpecSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("i18n-expansion"),
    expansionRatio: z.number().min(0).max(3),
    minWordLength: z.number().int().min(1),
    syllables: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    kind: z.literal("rtl-mirror"),
    dir: z.literal("rtl"),
    lang: z.string().min(2),
  }),
  z.object({
    kind: z.literal("payload-extremes"),
    longTokenLength: z.number().int().min(20).max(400),
    longTokenEvery: z.number().int().min(1),
    numberValues: z.array(z.string()).min(1),
    emptyLists: z.boolean(),
    dropOptional: z.boolean(),
  }),
  z.object({
    kind: z.literal("font-scale-200"),
    rootFontScale: z.number().min(1).max(4),
  }),
]);
export type TransformSpec = z.infer<typeof transformSpecSchema>;

export type StressedDocument = {
  html: string;
  dir: "ltr" | "rtl";
  lang: string;
  rootFontScale: number;
  report: {
    textNodesTouched: number;
    charsBefore: number;
    charsAfter: number;
    numbersReplaced: number;
    longTokensInjected: number;
    listsEmptied: number;
    optionalDropped: number;
  };
};

// FNV-1a 32-bit: stable, dependency-free choice function.
export const fnv1a = (input: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const TOKEN = /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]+>)/gi;
const WORD = /(&[#\w]+;)|([A-Za-zÀ-ÖØ-öø-ÿ]+)/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

const mapTextNodes = (
  html: string,
  fn: (text: string, index: number) => string,
): { html: string; touched: number; before: number; after: number } => {
  let index = 0;
  let touched = 0;
  let before = 0;
  let after = 0;
  const out = html
    .split(TOKEN)
    .map((part) => {
      if (!part || part.startsWith("<")) return part;
      if (!part.trim()) return part;
      const next = fn(part, index++);
      before += part.length;
      after += next.length;
      if (next !== part) touched++;
      return next;
    })
    .join("");
  return { html: out, touched, before, after };
};

const emptyReport = (html: string): StressedDocument["report"] => {
  const chars = html.replace(TOKEN, "").length;
  return {
    textNodesTouched: 0,
    charsBefore: chars,
    charsAfter: chars,
    numbersReplaced: 0,
    longTokensInjected: 0,
    listsEmptied: 0,
    optionalDropped: 0,
  };
};

export const applySaboteur = (
  html: string,
  spec: TransformSpec | null,
): StressedDocument => {
  const base: StressedDocument = {
    html,
    dir: "ltr",
    lang: "en",
    rootFontScale: 1,
    report: emptyReport(html),
  };
  if (!spec) return base;

  if (spec.kind === "rtl-mirror") {
    return { ...base, dir: spec.dir, lang: spec.lang };
  }

  if (spec.kind === "font-scale-200") {
    return { ...base, rootFontScale: spec.rootFontScale };
  }

  if (spec.kind === "i18n-expansion") {
    const result = mapTextNodes(html, (text) =>
      text.replace(WORD, (match, entity: string | undefined, word: string) => {
        if (entity || word.length < spec.minWordLength) return match;
        const target = Math.ceil(word.length * (1 + spec.expansionRatio));
        let suffix = "";
        let salt = 0;
        while (word.length + suffix.length < target) {
          const pick = fnv1a(`${word}:${salt++}`) % spec.syllables.length;
          suffix += spec.syllables[pick];
        }
        return word + suffix.slice(0, target - word.length);
      }),
    );
    return {
      ...base,
      lang: "de",
      html: result.html,
      report: {
        ...base.report,
        textNodesTouched: result.touched,
        charsBefore: result.before,
        charsAfter: result.after,
      },
    };
  }

  // payload-extremes
  let working = html;
  let listsEmptied = 0;
  let optionalDropped = 0;
  if (spec.dropOptional) {
    working = working.replace(
      /<(\w+)\b[^>]*\bdata-optional\b[^>]*>[\s\S]*?<\/\1>/g,
      () => {
        optionalDropped++;
        return "";
      },
    );
  }
  if (spec.emptyLists) {
    working = working.replace(
      /<(ul|ol)\b([^>]*)>[\s\S]*?<\/\1>/g,
      (_m, tag: string, attrs: string) => {
        listsEmptied++;
        return `<${tag}${attrs}></${tag}>`;
      },
    );
  }
  let numbersReplaced = 0;
  let longTokensInjected = 0;
  const result = mapTextNodes(working, (text, index) => {
    let next = text.replace(NUMBER, (num) => {
      const pick = fnv1a(`${num}:${index}`) % spec.numberValues.length;
      numbersReplaced++;
      return spec.numberValues[pick] ?? num;
    });
    if (index % spec.longTokenEvery === 0) {
      let injected = false;
      next = next.replace(WORD, (match, entity: string | undefined, word: string) => {
        if (injected || entity || word.length < 3) return match;
        injected = true;
        let token = "";
        let n = 0;
        while (token.length < spec.longTokenLength) {
          token += n === 0 ? word : `${word}${n}`;
          n++;
        }
        longTokensInjected++;
        return token.slice(0, spec.longTokenLength);
      });
    }
    return next;
  });
  return {
    ...base,
    html: result.html,
    report: {
      textNodesTouched: result.touched,
      charsBefore: result.before,
      charsAfter: result.after,
      numbersReplaced,
      longTokensInjected,
      listsEmptied,
      optionalDropped,
    },
  };
};

// The canonical chaos library inserted for each workspace on first use.
export const DEFAULT_CHAOS_CASES: { name: string; spec: TransformSpec }[] = [
  {
    name: "German compound expansion (+40%)",
    spec: {
      kind: "i18n-expansion",
      expansionRatio: 0.4,
      minWordLength: 3,
      syllables: ["ungs", "keit", "schaft", "verwaltung", "gebühren", "einstellung", "übersicht"],
    },
  },
  {
    name: "Arabic RTL mirror",
    spec: { kind: "rtl-mirror", dir: "rtl", lang: "ar" },
  },
  {
    name: "Payload extremes",
    spec: {
      kind: "payload-extremes",
      longTokenLength: 120,
      longTokenEvery: 3,
      numberValues: ["0", "-1,284,903.55", "99,999,999,999"],
      emptyLists: true,
      dropOptional: true,
    },
  },
  {
    name: "Root font scale 200%",
    spec: { kind: "font-scale-200", rootFontScale: 2 },
  },
];
