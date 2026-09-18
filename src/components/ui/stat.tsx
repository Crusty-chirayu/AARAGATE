import * as React from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

/**
 * StatTile — a single measured number (Batch B).
 *
 * Deliberately has no default value and no placeholder: if a caller has no real
 * measurement, it must render an EmptyState instead of a plausible-looking zero.
 * `delta` is optional and only renders when a real comparison exists.
 *
 * Numerals are `tabular-nums` so a column of these does not jitter as values
 * change, which is exactly what happens on a results screen.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = "neutral",
  delta,
  className,
}: {
  label: string;
  /** Pre-formatted by the caller — a tile never guesses a unit or precision. */
  value: string;
  unit?: string;
  hint?: React.ReactNode;
  icon?: React.ElementType;
  tone?: "neutral" | "accent" | "ascent" | "ai";
  /** Only render when a real before/after comparison exists. */
  delta?: { direction: "up" | "down" | "flat"; label: string };
  className?: string;
}) {
  const valueTone: Record<string, string> = {
    neutral: "text-[var(--fg)]",
    accent: "text-[var(--accent-text)]",
    ascent: "text-[var(--gold-500)]",
    ai: "text-[var(--ai-teal-500)]",
  };

  return (
    <Card padding="sm" className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--fg-subtle)]">
          {label}
        </span>
        {Icon && <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--fg-subtle)]" />}
      </div>

      <div className="flex items-baseline gap-1">
        <span className={cn("text-[22px] font-semibold tabular-nums tracking-tight", valueTone[tone])}>
          {value}
        </span>
        {unit && <span className="text-[12.5px] text-[var(--fg-muted)]">{unit}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11.5px] font-medium tabular-nums",
              delta.direction === "up" && "text-[var(--success)]",
              delta.direction === "down" && "text-[var(--danger)]",
              delta.direction === "flat" && "text-[var(--fg-muted)]",
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRight aria-hidden className="h-3 w-3" />
            ) : delta.direction === "down" ? (
              <ArrowDownRight aria-hidden className="h-3 w-3" />
            ) : (
              <ArrowRight aria-hidden className="h-3 w-3" />
            )}
            {delta.label}
          </span>
        )}
        {hint && <span className="text-[11.5px] leading-snug text-[var(--fg-subtle)]">{hint}</span>}
      </div>
    </Card>
  );
}