import { IconBomb } from "@tabler/icons-react";

import type { SaboteurProfile } from "@shared/arena-protocol";
import { cn } from "@/lib/utils";

const OPTIONS: { value: SaboteurProfile; label: string; hint: string }[] = [
  { value: "none", label: "Clean", hint: "No chaos mutation" },
  { value: "i18n-expansion", label: "DE +40%", hint: "German-style compound expansion of every word" },
  { value: "rtl-mirror", label: "RTL", hint: "dir=rtl, lang=ar mirror" },
  { value: "payload-extremes", label: "Extremes", hint: "120-char tokens, extreme numbers, empty lists, missing optional fields" },
  { value: "font-scale-200", label: "200%", hint: "Root font-size 200%" },
];

type SaboteurSwitchProps = {
  value: SaboteurProfile;
  disabled: boolean;
  onChange: (value: SaboteurProfile) => void;
};

export const SaboteurSwitch = ({ value, disabled, onChange }: SaboteurSwitchProps) => (
  <div className="flex items-center gap-2">
    <IconBomb
      className={cn("size-4", value === "none" ? "text-muted-foreground" : "text-[hsl(var(--bs-knockdown))]")}
      aria-hidden="true"
    />
    <div role="radiogroup" aria-label="Saboteur profile" className="flex rounded-md border border-border p-0.5">
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            disabled={disabled && !active}
            onClick={() => !active && onChange(option.value)}
            className={cn(
              "min-h-8 rounded-sm px-2.5 font-display text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? option.value === "none"
                  ? "bg-foreground text-background"
                  : "bg-[hsl(var(--bs-knockdown))] text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  </div>
);
