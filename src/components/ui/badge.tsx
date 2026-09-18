import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge — status and category signal (Batch B).
 *
 * Every tone is a validated pair from `scripts/contrast.mjs`: the tone's colour
 * is used as TEXT on its own subtle surface, so it must clear 4.5:1, not 3:1.
 * The `ai` tone deliberately keeps `--foreground` for the label and puts the AI
 * identity in the icon colour — teal-on-teal at label size measured 4.32:1 in
 * light and 2.93:1 in dark, i.e. it only works as a graphic, never as text.
 */
const badge = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--r-pill)] border font-medium",
  {
    variants: {
      tone: {
        neutral: "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--fg-muted)]",
        accent: "border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]",
        ai: "border-[var(--border)] bg-[var(--bubble-ai-bg)] text-[var(--foreground)]",
        success: "border-transparent bg-[var(--success-subtle)] text-[var(--success)]",
        warning: "border-transparent bg-[var(--warning-subtle)] text-[var(--warning)]",
        danger: "border-transparent bg-[var(--danger-subtle)] text-[var(--danger)]",
        /** Progress / mastery only — see globals.css brand layer. */
        ascent: "border-transparent bg-[var(--gold-subtle)] text-[var(--gold-500)]",
      },
      size: {
        sm: "px-1.5 py-px text-[10.5px]",
        md: "px-2 py-0.5 text-[11.5px]",
        lg: "px-2.5 py-1 text-[12.5px]",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {
  icon?: React.ElementType;
  /** Icon colour override; defaults to the tone's own colour. */
  iconClassName?: string;
}

export function Badge({ tone, size, icon: Icon, iconClassName, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone, size }), className)} {...props}>
      {Icon && (
        <Icon
          aria-hidden
          className={cn("h-3 w-3 shrink-0", tone === "ai" && "text-[var(--ai-teal-500)]", iconClassName)}
        />
      )}
      {children}
    </span>
  );
}

/**
 * A small count/status dot. Uses the same tones so a status colour never means
 * two different things in two places.
 */
export function StatusDot({
  tone = "neutral",
  pulse = false,
  className,
  label,
}: {
  tone?: NonNullable<VariantProps<typeof badge>["tone"]>;
  /** Adds the existing slow AI pulse — for in-progress states only. */
  pulse?: boolean;
  className?: string;
  /** Accessible name; omit for a purely decorative dot. */
  label?: string;
}) {
  const fill: Record<string, string> = {
    neutral: "bg-[var(--neutral-500)]",
    accent: "bg-[var(--accent)]",
    ai: "bg-[var(--ai-teal-500)]",
    success: "bg-[var(--success)]",
    warning: "bg-[var(--warning)]",
    danger: "bg-[var(--danger)]",
    ascent: "bg-[var(--gold-500)]",
  };
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        fill[tone ?? "neutral"],
        pulse && "glow-breathe",
        className,
      )}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    />
  );
}