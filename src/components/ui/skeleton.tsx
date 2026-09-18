import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden />;
}

export function ConversationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-1 p-2" aria-label="Loading conversations" role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-[var(--r-md)] px-2 py-2.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 rounded" style={{ width: `${52 + ((i * 13) % 34)}%` }} />
            <Skeleton className="h-2.5 rounded" style={{ width: `${68 + ((i * 7) % 24)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageListSkeleton() {
  const rows = [
    { ai: false, w: [46] },
    { ai: true, w: [94, 88, 62] },
    { ai: false, w: [34] },
    { ai: true, w: [90, 74] },
  ];
  return (
    <div className="space-y-7 px-4 py-6" role="status" aria-label="Loading messages">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-2.5 w-24 rounded" />
            {r.w.map((w, j) => (
              <Skeleton key={j} className="h-3 rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
/**
 * Batch B additions. Shapes only — a skeleton must mirror the real layout so it
 * does not itself cause a shift when content lands.
 */

/** Multi-line prose placeholder; the last line is short, like real text. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3 rounded"
          style={{ width: i === lines - 1 ? "62%" : `${88 + ((i * 5) % 10)}%` }}
        />
      ))}
    </div>
  );
}

/** A card-shaped panel: header row, body lines, optional footer row. */
export function PanelSkeleton({
  lines = 3,
  footer = false,
  className,
}: {
  lines?: number;
  footer?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5", className)}
      role="status"
      aria-label="Loading"
    >
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-7 w-7 rounded-[var(--r-sm)]" />
        <Skeleton className="h-3.5 w-32 rounded" />
      </div>
      <SkeletonText lines={lines} className="mt-4" />
      {footer && (
        <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-3.5">
          <Skeleton className="h-6 w-20 rounded-[var(--r-sm)]" />
          <Skeleton className="h-6 w-14 rounded-[var(--r-sm)]" />
        </div>
      )}
    </div>
  );
}

/** Grid of card skeletons — dashboards, document lists, result grids. */
export function CardGridSkeleton({ cards = 4, cols = 2 }: { cards?: number; cols?: 1 | 2 | 3 }) {
  const grid = cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : "";
  return (
    <div className={cn("grid gap-3", grid)} role="status" aria-label="Loading">
      {Array.from({ length: cards }).map((_, i) => (
        <PanelSkeleton key={i} lines={2} />
      ))}
    </div>
  );
}
