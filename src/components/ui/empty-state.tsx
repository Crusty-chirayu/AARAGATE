import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * EmptyState — what a surface shows when there is genuinely nothing yet
 * (Batch B).
 *
 * Exists so "no data" is never rendered as a blank panel or, worse, as a fake
 * statistic. Every list in AARAGATE has one of these wired to it, with an action
 * that actually does something (an empty state whose button is decorative is
 * just a slower dead end).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  note,
  compact = false,
  className,
}: {
  icon: React.ElementType;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Small print for scope limits, e.g. "not available yet — needs X". */
  note?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--r-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)]/50 text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--fg-muted)]",
          compact ? "h-8 w-8" : "h-10 w-10",
        )}
      >
        <Icon className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
      </span>
      <div className="max-w-sm">
        <p className={cn("font-semibold tracking-tight text-[var(--fg)]", compact ? "text-[13px]" : "text-[14px]")}>
          {title}
        </p>
        {description && (
          <p className="mt-1 text-pretty text-[12.5px] leading-relaxed text-[var(--fg-muted)]">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
      {note && <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-[var(--fg-subtle)]">{note}</p>}
    </div>
  );
}