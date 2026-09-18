import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Alert — inline message surface (Batch B).
 *
 * Two accessibility decisions are baked in rather than left to callers:
 *  - `role` is derived from severity. Informational/success notes are polite
 *    (`status`); warnings and errors are assertive (`alert`). A caller can
 *    override, but the default is the correct one.
 *  - The icon is decorative (`aria-hidden`); the text carries the meaning, so a
 *    screen reader never hears "warning" twice.
 */

export type AlertTone = "info" | "success" | "warning" | "danger" | "accent" | "ai";

const TONES: Record<AlertTone, { shell: string; icon: React.ElementType }> = {
  info: { shell: "border-[var(--info)]/25 bg-[var(--info-subtle)]", icon: Info },
  success: { shell: "border-[var(--success)]/25 bg-[var(--success-subtle)]", icon: CheckCircle2 },
  warning: { shell: "border-[var(--warning)]/30 bg-[var(--warning-subtle)]", icon: AlertTriangle },
  danger: { shell: "border-[var(--danger)]/25 bg-[var(--danger-subtle)]", icon: XCircle },
  accent: { shell: "border-[var(--accent-border)] bg-[var(--accent-subtle)]", icon: ShieldAlert },
  ai: { shell: "border-[var(--bubble-ai-ring)]/30 bg-[var(--bubble-ai-bg)]", icon: Sparkles },
};

const ICON_COLOR: Record<AlertTone, string> = {
  info: "text-[var(--info)]",
  success: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
  accent: "text-[var(--accent-text)]",
  ai: "text-[var(--ai-teal-500)]",
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: AlertTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  const { shell, icon: Icon } = TONES[tone];
  const asserted = role ?? (tone === "warning" || tone === "danger" ? "alert" : "status");

  return (
    <div
      role={asserted}
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--r-md)] border px-3.5 py-3 text-[12.5px] leading-relaxed",
        shell,
        className,
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", ICON_COLOR[tone])} />
      <div className="min-w-0 flex-1 text-[var(--fg)]">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-[var(--fg-muted)]")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}