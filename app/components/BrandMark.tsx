import { cn } from "@/lib/utils";

// Top-down boxing ring: three ropes inside corner posts.
export const BrandMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6 shrink-0", className)}>
    <rect x="1" y="1" width="22" height="22" rx="2" fill="hsl(var(--bs-caution))" />
    <rect x="4.5" y="4.5" width="15" height="15" fill="none" stroke="hsl(var(--bs-caution-ink))" strokeWidth="1.4" />
    <path d="M4.5 9.5h15M4.5 14.5h15" stroke="hsl(var(--bs-caution-ink))" strokeWidth="1.4" />
    <circle cx="4.5" cy="4.5" r="1.6" fill="hsl(var(--bs-caution-ink))" />
    <circle cx="19.5" cy="4.5" r="1.6" fill="hsl(var(--bs-caution-ink))" />
    <circle cx="4.5" cy="19.5" r="1.6" fill="hsl(var(--bs-caution-ink))" />
    <circle cx="19.5" cy="19.5" r="1.6" fill="hsl(var(--bs-caution-ink))" />
  </svg>
);

export const Wordmark = ({ className }: { className?: string }) => (
  <span className={cn("font-display truncate text-[17px] leading-none text-sidebar-accent-foreground", className)}>
    Brawl<span className="text-[hsl(var(--bs-caution))]">Stage</span>
  </span>
);
