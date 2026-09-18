"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Command,
  Hash,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Pin,
  Plus,
  Search,
  Settings,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Avatar, AiAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/logo";
import { EmptyState } from "@/components/ui/empty-state";
import { BRAND } from "@/lib/brand";
import { ThemeToggle } from "@/components/theme-provider";
import { ConversationListSkeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/session-provider";
import { signOut } from "@/lib/data/api";
import type { ConversationSummary } from "@/lib/types";
import {
  cn,
  conversationTitle,
  partitionPinned,
  plainPreview,
  relativeTime,
  truncate,
} from "@/lib/utils";
import { popIn, SPRING, tEnter } from "@/lib/motion";

/**
 * Primary navigation (Batch B).
 *
 * Only routes this application can actually serve appear here. Practice, mock
 * tests and trend analysis exist in the IA (see `PRIMARY_AREAS` in
 * `@/lib/brand`) but have no data model behind them yet, so they are deliberately
 * absent rather than rendered as dead links — see docs/AARAGATE-UI-AUDIT.md §8.1.
 */
const PRIMARY_NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({
  conversations,
  loading,
  onNew,
  onJoin,
  onSearch,
  onPalette,
  onNavigate,
  onTogglePin,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  onNew: () => void;
  onJoin: () => void;
  onSearch: () => void;
  onPalette: () => void;
  onNavigate?: () => void;
  onTogglePin?: (conversationId: string, pinned: boolean) => void;
}) {
  const pathname = usePathname();
  const { profile } = useSession();

  // §3 pinned conversations: pinned rows float to the top of the list, in
  // the order they were pinned, and are removed from the type groups below.
  const { pinned, rest } = partitionPinned(conversations);
  const direct = rest.filter((c) => c.type === "direct_ai");
  const rooms = rest.filter((c) => c.type === "group");

  const handleSignOut = () => void signOut();

  return (
    // The sidebar is a translucent plane, not a flat panel: a soft tint
    // over whatever sits behind it (the app shell's ambient field on
    // desktop, the `.glass-strong` drawer surface on mobile) rather than
    // an opaque rectangle, so it reads as one material layered into the
    // shell in both contexts.
    <div className="relative flex h-full flex-col bg-[var(--bg-subtle)]/75 backdrop-blur-sm">
      {/* header */}
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <Link
          href="/app"
          onClick={onNavigate}
          aria-label={`${BRAND.name} dashboard`}
          className="rounded-[var(--r-sm)] px-1"
        >
          <BrandLockup logoClassName="h-6 w-6" wordmarkClassName="text-[14px]" />
        </Link>
        <ThemeToggle />
      </div>

      {/* primary areas — implemented routes only */}
      <nav aria-label="Sections" className="px-3 pb-2.5">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 text-[13px] font-medium transition-colors duration-[var(--d-micro)]",
                    active
                      ? "bg-[var(--bg-active)] text-[var(--fg)]"
                      : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]",
                  )}
                >
                  <item.icon aria-hidden className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* actions */}
      <div className="space-y-1.5 px-3 pb-3">
        <Button
          onClick={onNew}
          className="press-fluid w-full justify-start gap-2 shadow-[var(--e1)] transition-shadow duration-[var(--d-standard)] hover:shadow-[var(--e2)]"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className="press-fluid flex-1 justify-start"
            onClick={onPalette}
          >
            <Command className="h-3.5 w-3.5" />
            Commands
            <kbd className="ml-auto hidden rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-subtle)] sm:inline">
              ⌘K
            </kbd>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="press-fluid"
            onClick={onSearch}
            aria-label="Search messages"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="press-fluid"
            onClick={onJoin}
            aria-label="Join a study room"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* list */}
      <div className="min-h-0 flex-1 scroll-smooth overflow-y-auto px-2 pb-2">
        {loading ? (
          <ConversationListSkeleton />
        ) : conversations.length === 0 ? (
          <EmptyState
            compact
            icon={MessagesSquare}
            title="Nothing here yet"
            description="Start a chat with the tutor, or open a study room and bring your batch in."
            action={
              <Button size="sm" variant="secondary" onClick={onNew}>
                <Plus className="h-4 w-4" />
                New chat
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {pinned.length > 0 && (
              <Group label="Pinned">
                {pinned.map((c) => (
                  <ConversationRow
                    key={c.id}
                    c={c}
                    active={pathname === `/app/c/${c.id}`}
                    onNavigate={onNavigate}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </Group>
            )}
            {direct.length > 0 && (
              <Group label="AI chats">
                {direct.map((c) => (
                  <ConversationRow
                    key={c.id}
                    c={c}
                    active={pathname === `/app/c/${c.id}`}
                    onNavigate={onNavigate}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </Group>
            )}
            {rooms.length > 0 && (
              <Group label="Study rooms">
                {rooms.map((c) => (
                  <ConversationRow
                    key={c.id}
                    c={c}
                    active={pathname === `/app/c/${c.id}`}
                    onNavigate={onNavigate}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </Group>
            )}
          </div>
        )}
      </div>

      {/* footer */}
      <div className="relative p-2">
        <div aria-hidden="true" className="divider-fade absolute inset-x-2 top-0" />
        <div className="mt-[1px] flex items-center gap-2 rounded-[var(--r-md)] px-2 py-2 transition-colors duration-[var(--d-standard)] hover:bg-[var(--bg-hover)]">
          <Avatar name={profile?.display_name ?? "You"} url={profile?.avatar_url} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{profile?.display_name ?? "You"}</p>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            className="press-fluid"
            onClick={handleSignOut}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div data-testid="conversation-group" data-group={label}>
      <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-subtle)]">
        {label}
      </p>
      {/* A real list: screen readers announce "list of N items" and the
          group heading names it, rather than a run of unrelated links. */}
      <ul aria-label={label} className="space-y-px">
        {children}
      </ul>
    </div>
  );
}

function ConversationRow({
  c,
  active,
  onNavigate,
  onTogglePin,
}: {
  c: ConversationSummary;
  active: boolean;
  onNavigate?: () => void;
  onTogglePin?: (conversationId: string, pinned: boolean) => void;
}) {
  const title = conversationTitle(c);
  const pinned = Boolean(c.pinned_at);
  const preview = c.last_message
    ? `${c.last_message.sender_type === "ai" ? "AI: " : ""}${truncate(plainPreview(c.last_message.content), 44)}`
    : "No messages yet";

  return (
    <motion.li
      layout
      transition={SPRING}
      // `group` scopes the pin button's hover/focus reveal to this row.
      // `isolate` + `overflow-hidden` contain the hover-illuminate glow and
      // the active accent bar to this row's own rounded shape.
      className={cn(
        "hover-illuminate group relative isolate flex items-center overflow-hidden rounded-[var(--r-md)] pr-1 transition-all duration-[var(--d-standard)] ease-[var(--ease-fluid)]",
        active
          ? "bg-gradient-to-r from-[var(--bg-active)] to-[var(--bg-active)]/30 shadow-[var(--e1)]"
          : "hover:bg-[var(--bg-hover)] hover:shadow-[var(--e1)]",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-[var(--accent-500)] to-[var(--ai-teal-500)]"
        />
      )}

      <Link
        href={`/app/c/${c.id}`}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--r-md)] px-2.5 py-2"
      >
        {c.type === "direct_ai" ? (
          <AiAvatar size="sm" />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--bg-active)] text-[var(--fg-muted)]">
            <Hash className="h-4 w-4" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "truncate text-[13px]",
                c.unread > 0 ? "font-semibold text-[var(--fg)]" : "font-medium text-[var(--fg)]",
              )}
            >
              {title}
            </p>
            {c.last_message && (
              <span className="shrink-0 text-[10.5px] text-[var(--fg-subtle)]">
                {relativeTime(c.last_message.created_at)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--fg-muted)]">{preview}</p>
            <AnimatePresence>
              {c.unread > 0 && (
                <motion.span
                  variants={popIn}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-[var(--accent-fg)]"
                >
                  {c.unread > 9 ? "9+" : c.unread}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Link>

      {onTogglePin && (
        <button
          type="button"
          data-testid={pinned ? "unpin-button" : "pin-button"}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
          title={pinned ? "Unpin" : "Pin to top"}
          onClick={() => onTogglePin(c.id, !pinned)}
          className={cn(
            "press-fluid grid h-6 w-6 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--fg-subtle)] transition-opacity duration-[var(--d-micro)]",
            "hover:bg-[var(--bg-active)] hover:text-[var(--fg)]",
            // Revealed on hover / keyboard focus so the row stays clean,
            // but always visible once pinned (state must be discoverable).
            pinned
              ? "text-[var(--accent-text)] opacity-100"
              : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <Pin
            className={cn("h-3.5 w-3.5", pinned && "fill-current")}
            strokeWidth={pinned ? 2.5 : 2}
          />
        </button>
      )}
    </motion.li>
  );
}

/**
 * §2.5 ai_mode badge:
 *   OFF           → neutral-500 dot
 *   MENTION_ONLY  → ai-teal-500 OUTLINE pill
 *   AUTO          → ai-teal-500 FILLED pill
 */
export function AiModeBadge({ mode }: { mode: string }) {
  if (mode === "off") {
    return (
      <motion.span
        layout
        transition={tEnter(0.2)}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--neutral-500)]"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--neutral-500)]" aria-hidden />
        Assistant off
      </motion.span>
    );
  }

  const filled = mode === "auto";
  return (
    <motion.span
      layout
      transition={tEnter(0.2)}
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--r-pill)] px-2 py-0.5 text-[11px] font-semibold",
        filled
          ? "bg-[var(--ai)] text-[var(--ai-foreground)]"
          : "border border-[var(--ai-teal-500)] text-[var(--ai-teal-500)]",
      )}
    >
      <Sparkles className="h-3 w-3" />
      {filled ? "Assistant auto" : "On mention"}
    </motion.span>
  );
}