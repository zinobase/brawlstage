import { IconBook2 } from "@tabler/icons-react";

type Rule = {
  id: string;
  extractedInvariant: string;
  unifiedDiff: string;
  skillPath: string;
  createdAt: string;
};

const diffLineClass = (line: string): string => {
  if (line.startsWith("+++") || line.startsWith("---")) return "text-muted-foreground";
  if (line.startsWith("@@")) return "text-[hsl(var(--bs-caution))]";
  if (line.startsWith("+")) return "text-[hsl(var(--bs-clean))]";
  if (line.startsWith("-")) return "text-[hsl(var(--bs-knockdown))]";
  return "text-muted-foreground";
};

export const LearnedRules = ({ rules }: { rules: Rule[] }) => {
  if (!rules.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <IconBook2 className="size-5 text-muted-foreground" />
        <p className="max-w-[16rem] text-xs text-muted-foreground">
          When you hand-edit CSS after an agent draft, bank the difference here. Each rule is appended to the agent's learned-layout-rules skill.
        </p>
      </div>
    );
  }
  return (
    <ol className="space-y-4">
      {rules.map((rule) => (
        <li key={rule.id} className="rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
            <span className="font-display text-[11px]">Rule · {rule.createdAt.slice(0, 16).replace("T", " ")}</span>
            <span className="font-mono-num text-[11px] text-muted-foreground">{rule.skillPath.split("/").slice(-2).join("/")}</span>
          </div>
          <div className="whitespace-pre-wrap px-2.5 py-2 text-[11px] leading-relaxed">{rule.extractedInvariant}</div>
          <details className="border-t border-border">
            <summary className="cursor-pointer px-2.5 py-1.5 font-display text-[11px] text-muted-foreground">Unified diff</summary>
            <pre className="max-h-64 overflow-auto px-2.5 pb-2 font-mono-num text-[11px] leading-snug">
              {rule.unifiedDiff.split("\n").map((line, i) => (
                <div key={i} className={diffLineClass(line)}>
                  {line || " "}
                </div>
              ))}
            </pre>
          </details>
        </li>
      ))}
    </ol>
  );
};
