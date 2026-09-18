import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * AARAGATE mark — "the gate and the ascent".
 *
 * An arch is the gateway into preparation; the ascending polyline with a
 * single node is the route through the syllabus and the point of mastery. The
 * node is the one place amber appears in the chrome, which is why the accent
 * family is reserved for progress signal everywhere else.
 *
 * Implementation notes:
 *  - No `<defs>`, no gradients: SVG ids are document-global, and the previous
 *    mark emitted `cf-g`/`cf-sheen`/`cf-edge` once per instance, so a page with
 *    six logos carried six duplicate ids. Flat fills remove that whole class of
 *    bug (and the paint cost of a gradient along with it).
 *  - The on-tile amber is a FIXED hex, not a token. The tile is indigo in both
 *    themes, so a theme-aware amber would turn near-black in light mode and
 *    vanish against it. Measured on `#4338ca`: white 7.9:1, amber 5.1:1
 *    (WCAG non-text/graphic minimum is 3:1).
 *  - No hooks, no "use client": this renders inside server components, so the
 *    mark cannot drag framer-motion into the marketing bundle.
 */

/** Arch: two piers joined by a semicircle — the gate. */
const GATE_ARCH = "M8.6 25.4V16a7.4 7.4 0 0 1 14.8 0v9.4";
/** Ascent: a rising polyline inside the gate — the knowledge path. */
const ASCENT_PATH = "M11.5 23.6 14.4 19.8 17 21.4 20 16.8";
/** Mastery node, at the top of the ascent. */
const NODE = { cx: 20, cy: 16.8, r: 1.5 } as const;
/** Amber that reads on the indigo tile in both themes (5.1:1). */
const TILE_ACCENT = "#ffc76b";

export type LogoVariant = "tile" | "mono";

export function Logo({
  className,
  variant = "tile",
  animated = false,
  title,
}: {
  className?: string;
  /** `tile` = indigo slab (app chrome). `mono` = currentColor (footers, inverted). */
  variant?: LogoVariant;
  /** Play the one-shot gate draw. Static by default; never loops. */
  animated?: boolean;
  /** Provide only when the mark is the accessible name of a control. */
  title?: string;
}) {
  const tile = variant === "tile";

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      {...(title
        ? { role: "img", "aria-label": title }
        : { "aria-hidden": true, role: "presentation" })}
    >
      {tile && (
        <>
          <rect
            width="32"
            height="32"
            rx="9"
            className={cn("fill-[var(--brand)]", animated && "gate-tile")}
          />
          {/* hairline rim + one top highlight: polish without a second gradient layer */}
          <rect
            x="0.5"
            y="0.5"
            width="31"
            height="31"
            rx="8.5"
            fill="none"
            stroke="white"
            strokeOpacity="0.18"
          />
          <path
            d="M10 1.6h12"
            stroke="white"
            strokeOpacity="0.4"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}

      {/* the gate */}
      <path
        d={GATE_ARCH}
        pathLength={1}
        className={cn(tile ? "stroke-white" : "stroke-current", animated && "gate-arch")}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={tile ? 0.97 : 0.9}
      />

      {/* the ascent */}
      <path
        d={ASCENT_PATH}
        pathLength={1}
        stroke={tile ? TILE_ACCENT : "currentColor"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={tile ? 0.98 : 0.55}
        className={animated ? "gate-ascent" : undefined}
      />

      {/* the mastery node */}
      <circle
        cx={NODE.cx}
        cy={NODE.cy}
        r={NODE.r}
        fill={tile ? TILE_ACCENT : "currentColor"}
        opacity={tile ? 1 : 0.75}
        className={animated ? "gate-node" : undefined}
      />
    </svg>
  );
}

/**
 * The wordmark. "AARA" carries the foreground colour, "GATE" the theme-aware
 * `--accent-text`, which `scripts/contrast.mjs` validates against every surface
 * this lockup is placed on.
 *
 * Rendered as text rather than paths, so it re-flows with the type scale, stays
 * selectable, and is announced by assistive tech as the product name.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap font-semibold uppercase leading-none tracking-[-0.01em]",
        className,
      )}
    >
      {BRAND.wordmark.lead}
      <span className="text-[var(--accent-text)]">{BRAND.wordmark.trail}</span>
    </span>
  );
}

/**
 * Mark + wordmark in one element — the single lockup used by the landing nav,
 * the auth shell, the app sidebar, the mobile bar and the marketing headers, so
 * the two can never drift apart in size or spacing.
 *
 * Renders a `<span>`: callers decide whether it sits inside a link.
 */
export function BrandLockup({
  className,
  logoClassName = "h-7 w-7",
  wordmarkClassName = "text-[15px]",
  variant = "tile",
  animated = false,
}: {
  className?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  variant?: LogoVariant;
  animated?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Logo className={logoClassName} variant={variant} animated={animated} />
      <Wordmark className={wordmarkClassName} />
    </span>
  );
}

/**
 * Full-surface loading state (route-level `loading.tsx`, splash).
 *
 * The mark draws once and then holds: no spinner, no loop, no layout shift (the
 * SVG is a fixed box). Reduced motion collapses the draw straight to its finished
 * frame via the global `prefers-reduced-motion` rule — which is exactly why every
 * keyframe in globals.css ends on the *visible* state with `fill-mode: both`.
 */
export function LogoLoader({
  label = "Preparing your workspace",
  className,
  logoClassName = "h-11 w-11",
}: {
  label?: string;
  className?: string;
  logoClassName?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-4", className)}
    >
      <Logo animated className={logoClassName} />
      <p className="text-[13px] text-[var(--fg-muted)]">{label}</p>
    </div>
  );
}