"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SPRING, tEnter } from "@/lib/motion";

/**
 * Tabs (Batch B) — tabs for the practice/analysis surfaces in Batch D, and for
 * grouping the document workspace's status views in Batch C.
 *
 * Follows the WAI-ARIA tabs pattern rather than inventing one:
 *  - `role="tablist"` / `tab` / `tabpanel`, wired with `aria-controls` and
 *    `aria-labelledby` in both directions.
 *  - Roving tabindex: only the active tab is in the tab order, and
 *    ArrowLeft/ArrowRight/Home/End move *and* activate (automatic activation —
 *    the recommended pattern when panel content is cheap to render).
 *  - Each panel is focusable (`tabIndex={0}`) so keyboard users can reach the
 *    content without a mouse, which is what the pattern requires.
 *  - The active indicator is a `layoutId` pill, so it slides between tabs
 *    instead of blinking — and collapses instantly under reduced motion,
 *    because framer-motion is wrapped by the app's MotionProvider.
 */
export interface TabItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  content: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export function Tabs({
  items,
  defaultId,
  ariaLabel,
  className,
  panelClassName,
}: {
  items: readonly TabItem[];
  defaultId?: string;
  /** Accessible name for the tablist, e.g. "Document status". */
  ariaLabel: string;
  className?: string;
  panelClassName?: string;
}) {
  const uid = React.useId();
  const enabled = items.filter((i) => !i.disabled);
  const [active, setActive] = React.useState(defaultId ?? enabled[0]?.id ?? "");
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const current = items.find((i) => i.id === active) ?? enabled[0];

  const move = (from: string, delta: number) => {
    if (enabled.length === 0) return;
    const at = enabled.findIndex((i) => i.id === from);
    const next = enabled[(at + delta + enabled.length) % enabled.length];
    setActive(next.id);
    refs.current[next.id]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(id, 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(id, -1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(enabled[0].id);
      refs.current[enabled[0].id]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = enabled[enabled.length - 1];
      setActive(last.id);
      refs.current[last.id]?.focus();
    }
  };

  if (!current) return null;

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-1"
      >
        {items.map((item) => {
          const selected = item.id === current.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[item.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${uid}-${item.id}`}
              aria-selected={selected}
              aria-controls={`panel-${uid}-${item.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => setActive(item.id)}
              onKeyDown={(e) => onKeyDown(e, item.id)}
              className={cn(
                "relative flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors duration-[var(--d-micro)]",
                "disabled:cursor-not-allowed disabled:opacity-45",
                selected ? "text-[var(--fg)]" : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
              )}
            >
              {selected && (
                <motion.span
                  aria-hidden
                  layoutId={`tab-pill-${uid}`}
                  className="absolute inset-0 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--e1)]"
                  transition={SPRING}
                />
              )}
              {Icon && <Icon aria-hidden className="relative h-3.5 w-3.5" />}
              <span className="relative">{item.label}</span>
              {item.badge && <span className="relative">{item.badge}</span>}
            </button>
          );
        })}
      </div>

      <motion.div
        key={current.id}
        role="tabpanel"
        id={`panel-${uid}-${current.id}`}
        aria-labelledby={`tab-${uid}-${current.id}`}
        tabIndex={0}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={tEnter(0.16)}
        className={cn("mt-4 focus-visible:outline-2 focus-visible:outline-offset-2", panelClassName)}
      >
        {current.content}
      </motion.div>
    </div>
  );
}