import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — the one resting surface in AARAGATE (Batch B).
 *
 * Rules encoded here so they cannot drift per screen:
 *  - `variant` picks the material; `interactive` opts into the fluid hover lift,
 *    which is the `.surface-card` utility because that is where the
 *    `prefers-reduced-motion` opt-out for the transform already lives.
 *  - Only ONE card per viewport may use `variant="accent"` (the gradient
 *    hairline). If two are on screen the accent stops meaning "this one".
 *  - Not a client component: cards render inside server components, so this
 *    file must never import framer-motion.
 */

type CardVariant = "default" | "flush" | "raised" | "accent";
type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-3.5",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

const VARIANT: Record<CardVariant, string> = {
  default: "border border-[var(--border)] bg-[var(--surface)] shadow-[var(--e1)]",
  flush: "border border-[var(--border)] bg-transparent",
  raised: "border border-[var(--border)] bg-[var(--bg-surface-raised)] shadow-[var(--e2)]",
  // gradient-border draws its own 1px hairline; the transparent border is required.
  accent: "gradient-border border border-transparent shadow-[var(--e2)]",
};

export function Card({
  variant = "default",
  padding = "md",
  interactive = false,
  as: Tag = "div",
  className,
  children,
  ...props
}: {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Fluid hover lift + focus-within ring, reduced-motion aware. */
  interactive?: boolean;
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "rounded-[var(--r-lg)]",
        PADDING[padding],
        VARIANT[variant],
        // Last: the interactive material owns background/border/radius/shadow.
        interactive && "surface-card",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ElementType;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span
            aria-hidden
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold tracking-tight text-[var(--fg)]">{title}</h3>
          {description && (
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Content block that keeps vertical rhythm identical across screens. */
export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mt-4 space-y-2.5 text-[13.5px] text-[var(--fg-muted)]", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}