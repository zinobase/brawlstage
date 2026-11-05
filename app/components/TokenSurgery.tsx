import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

type TokenSurgeryProps = {
  tokens: Record<string, string>;
  css: string;
  html: string;
  pending: boolean;
  onLive: (name: string, value: string) => void;
  onCommitToken: (name: string, value: string) => void;
  onCommitCss: (css: string) => void;
  onCommitHtml: (html: string) => void;
};

const LENGTH = /^(-?\d*\.?\d+)(px|rem|em|%)$/;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const rangeFor = (unit: string): { max: number; step: number } => {
  if (unit === "px") return { max: 96, step: 1 };
  if (unit === "%") return { max: 100, step: 1 };
  return { max: 6, step: 0.125 };
};

const LengthToken = ({
  name,
  value,
  onLive,
  onCommit,
}: {
  name: string;
  value: string;
  onLive: (v: string) => void;
  onCommit: (v: string) => void;
}) => {
  const match = LENGTH.exec(value);
  const unit = match?.[2] ?? "px";
  const [draft, setDraft] = useState(Number(match?.[1] ?? 0));
  useEffect(() => setDraft(Number(LENGTH.exec(value)?.[1] ?? 0)), [value]);
  const { max, step } = rangeFor(unit);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
      <Label htmlFor={`tok-${name}`} className="font-mono-num text-[11px] text-muted-foreground">
        {name}
      </Label>
      <span className="font-mono-num text-[11px] text-[hsl(var(--bs-caution))]">
        {draft}
        {unit}
      </span>
      <Slider
        id={`tok-${name}`}
        className="col-span-2"
        min={0}
        max={Math.max(max, draft)}
        step={step}
        value={[draft]}
        onValueChange={([v = 0]) => {
          setDraft(v);
          onLive(`${v}${unit}`);
        }}
        onValueCommit={([v = 0]) => onCommit(`${v}${unit}`)}
      />
    </div>
  );
};

const ColorToken = ({ name, value, onLive, onCommit }: { name: string; value: string; onLive: (v: string) => void; onCommit: (v: string) => void }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex items-center gap-3">
      <input
        aria-label={`${name} color`}
        type="color"
        value={draft.length === 4 ? `#${draft[1]}${draft[1]}${draft[2]}${draft[2]}${draft[3]}${draft[3]}` : draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onLive(e.target.value);
        }}
        onBlur={() => draft !== value && onCommit(draft)}
        className="h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
      />
      <span className="flex-1 font-mono-num text-[11px] text-muted-foreground">{name}</span>
      <span className="font-mono-num text-[11px]">{draft}</span>
    </div>
  );
};

const TextToken = ({ name, value, onCommit }: { name: string; value: string; onCommit: (v: string) => void }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-1">
      <Label htmlFor={`tok-${name}`} className="font-mono-num text-[11px] text-muted-foreground">
        {name}
      </Label>
      <Input
        id={`tok-${name}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() && draft !== value && onCommit(draft.trim())}
        className="h-8 font-mono-num text-xs"
      />
    </div>
  );
};

export const TokenSurgery = ({
  tokens,
  css,
  html,
  pending,
  onLive,
  onCommitToken,
  onCommitCss,
  onCommitHtml,
}: TokenSurgeryProps) => {
  const [cssDraft, setCssDraft] = useState(css);
  const [htmlDraft, setHtmlDraft] = useState(html);
  useEffect(() => setCssDraft(css), [css]);
  useEffect(() => setHtmlDraft(html), [html]);
  const entries = Object.entries(tokens);
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-display text-xs text-muted-foreground">Tokens · drag to re-measure</h3>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No design tokens on this component.</p>
        ) : (
          entries.map(([name, value]) =>
            LENGTH.test(value) ? (
              <LengthToken key={name} name={name} value={value} onLive={(v) => onLive(name, v)} onCommit={(v) => onCommitToken(name, v)} />
            ) : HEX.test(value) ? (
              <ColorToken key={name} name={name} value={value} onLive={(v) => onLive(name, v)} onCommit={(v) => onCommitToken(name, v)} />
            ) : (
              <TextToken key={name} name={name} value={value} onCommit={(v) => onCommitToken(name, v)} />
            ),
          )
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xs text-muted-foreground">CSS</h3>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-md font-display text-[11px]"
            disabled={pending || cssDraft === css}
            onClick={() => onCommitCss(cssDraft)}
          >
            Apply hand edit
          </Button>
        </div>
        <Textarea
          aria-label="Component CSS"
          value={cssDraft}
          onChange={(e) => setCssDraft(e.target.value)}
          spellCheck={false}
          className="h-72 resize-y rounded-md font-mono-num text-[11px] leading-relaxed"
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xs text-muted-foreground">Markup</h3>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-md font-display text-[11px]"
            disabled={pending || htmlDraft === html || !htmlDraft.trim()}
            onClick={() => onCommitHtml(htmlDraft)}
          >
            Save markup
          </Button>
        </div>
        <Textarea
          aria-label="Component HTML"
          value={htmlDraft}
          onChange={(e) => setHtmlDraft(e.target.value)}
          spellCheck={false}
          className="h-56 resize-y rounded-md font-mono-num text-[11px] leading-relaxed"
        />
      </section>
    </div>
  );
};
