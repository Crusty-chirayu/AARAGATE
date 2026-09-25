"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BookOpenCheck,
  Command,
  Edit2,
  FolderOpen,
  Hash,
  History,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  MoreVertical,
  Pin,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Avatar, AiAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/logo";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { BRAND } from "@/lib/brand";
import { ThemeToggle } from "@/components/theme-provider";
import { ConversationListSkeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/session-provider";
import { deleteConversation, signOut, updateConversation } from "@/lib/data/api";
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
 * Only routes this application can actually serve appear here. Mock tests remain
 * absent — they exist in the IA (see `PRIMARY_AREAS` in `@/lib/brand`) but have
 * no timed-exam model behind them, and a nav link to a page that cannot answer
 * is a broken promise (docs/AARAGATE-UI-AUDIT.md §8.1).
 *
 * Practice, its attempt history and the analysis screen are present because they
 * are implemented: practice config, MCQ/MSQ/NAT answering, GATE-rules scoring
 * and attempt review all run against a real store.
 */
const PRIMARY_NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/practice", label: "Practice", icon: BookOpenCheck },
  { href: "/app/documents", label: "Documents", icon: FolderOpen },
  { href: "/app/attempts", label: "Attempts", icon: History },
  { href: "/app/analysis", label: "Analysis", icon: BarChart3 },
  { href: "/app/settings", label: "Settings", icon: Settings },
] as const;

/** "/app" is the index route, so it must match exactly and not by prefix. */
const isActive = (pathname: string, href: string) =>
  pathname === href || (href !== "/app" && pathname.startsWith(`${href}/`));

export function Sidebar({
  conversations,
  loading,
  onNew,
  onJoin,
  onSearch,
  onPalette,
  onNavigate,
  onTogglePin,
  onRefresh,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  onNew: () => void;
  onJoin: () => void;
  onSearch: () => void;
  onPalette: () => void;
  onNavigate?: () => void;
  onTogglePin?: (conversationId: string, pinned: boolean) => void;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { profile } = useSession();

  const [deletingConv, setDeletingConv] = React.useState<ConversationSummary | null>(null);
  const [renamingConv, setRenamingConv] = React.useState<ConversationSummary | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [savingRename, setSavingRename] = React.useState(false);

  const handleConfirmDelete = async () => {
    if (!deletingConv) return;
    try {
      await deleteConversation(deletingConv.id);
      toast.push({ kind: "success", title: "✓ Chat deleted" });
      if (pathname === `/app/c/${deletingConv.id}`) {
        router.push("/app");
      }
      onRefresh?.();
    } catch (e) {
      toast.push({ kind: "error", title: "Couldn't delete chat", description: String(e) });
    } finally {
      setDeletingConv(null);
    }
  };

  const handleStartRename = (c: ConversationSummary) => {
    setRenamingConv(c);
    setRenameValue(c.topic || c.name || "");
  };

  const handleConfirmRename = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!renamingConv || !renameValue.trim()) return;
    setSavingRename(true);
    try {
      await updateConversation(renamingConv.id, { topic: renameValue.trim() });
      toast.push({ kind: "success", title: "✓ Chat renamed" });
      onRefresh?.();
      setRenamingConv(null);
    } catch (e) {
      toast.push({ kind: "error", title: "Couldn't rename chat", description: String(e) });
    } finally {
      setSavingRename(false);
    }
  };

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
    <div className="relative flex h-full flex-col bg-[var(--bg-subtle)] border-r border-[var(--border-default)]">
      {/* header */}
      <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-[var(--border-default)]/60">
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
      <nav aria-label="Sections" className="px-3 py-2.5">
        <ul className="space-y-1">
          {PRIMARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[var(--r-md)] px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-[var(--d-micro)]",
                    active
                      ? "bg-[var(--bg-surface)] text-[var(--fg)] font-semibold shadow-xs border border-[var(--border-default)]"
                      : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]",
                  )}
                >
                  <item.icon aria-hidden className={cn("h-4 w-4 shrink-0", active && "text-[var(--accent)]")} />
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
                    onDelete={(conv) => setDeletingConv(conv)}
                    onRename={(conv) => handleStartRename(conv)}
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
                    onDelete={(conv) => setDeletingConv(conv)}
                    onRename={(conv) => handleStartRename(conv)}
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
                    onDelete={(conv) => setDeletingConv(conv)}
                    onRename={(conv) => handleStartRename(conv)}
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

      <ConfirmDialog
        open={deletingConv !== null}
        onClose={() => setDeletingConv(null)}
        onConfirm={handleConfirmDelete}
        title="Delete this conversation?"
        description="This will permanently delete this conversation and its messages. This action cannot be undone."
        destructive={true}
        confirmLabel="Delete"
      />

      <Modal
        open={renamingConv !== null}
        onClose={() => setRenamingConv(null)}
        title="Rename conversation"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRenamingConv(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={savingRename || !renameValue.trim()}
              loading={savingRename}
              onClick={() => void handleConfirmRename()}
            >
              Save
            </Button>
          </div>
        }
      >
        <form onSubmit={(e) => void handleConfirmRename(e)}>
          <Field label="Conversation title" id="rename-topic">
            <Input
              id="rename-topic"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
            />
          </Field>
        </form>
      </Modal>
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
  onDelete,
  onRename,
}: {
  c: ConversationSummary;
  active: boolean;
  onNavigate?: () => void;
  onTogglePin?: (conversationId: string, pinned: boolean) => void;
  onDelete?: (c: ConversationSummary) => void;
  onRename?: (c: ConversationSummary) => void;
}) {
  const title = conversationTitle(c);
  const pinned = Boolean(c.pinned_at);
  const preview = c.last_message
    ? `${c.last_message.sender_type === "ai" ? "AI: " : ""}${truncate(plainPreview(c.last_message.content), 44)}`
    : "No messages yet";

  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <motion.li
      layout
      transition={SPRING}
      className={cn(
        "group relative isolate flex items-center rounded-[var(--r-md)] pr-1 transition-all duration-[var(--d-standard)] ease-[var(--ease-fluid)]",
        menuOpen ? "overflow-visible z-30" : "overflow-hidden",
        active
          ? "bg-[var(--bg-surface)] shadow-xs border border-[var(--border-default)]"
          : "hover:bg-[var(--bg-hover)]",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[var(--accent-500)]"
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

      <div className="flex shrink-0 items-center gap-0.5">
        {(onDelete || onRename) && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label={`Options for ${title}`}
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className={cn(
                "press-fluid grid h-6 w-6 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--fg-subtle)] transition-opacity duration-[var(--d-micro)]",
                "hover:bg-[var(--bg-active)] hover:text-[var(--fg)]",
                menuOpen
                  ? "bg-[var(--bg-active)] text-[var(--fg)] opacity-100"
                  : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              <MoreVertical className="h-3.5 w-3.5" aria-hidden />
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Conversation options"
                className="absolute right-0 top-full z-40 mt-1 min-w-[130px] rounded-[var(--r-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] py-1 shadow-[var(--e3)] backdrop-blur-md"
              >
                {onRename && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onRename(c);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-[var(--fg)] transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <Edit2 className="h-3.5 w-3.5 text-[var(--fg-muted)]" aria-hidden />
                    Rename
                  </button>
                )}
                {onTogglePin && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onTogglePin(c.id, !pinned);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-[var(--fg)] transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <Pin className="h-3.5 w-3.5 text-[var(--fg-muted)]" aria-hidden />
                    {pinned ? "Unpin" : "Pin to top"}
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete(c);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger-100)] dark:hover:bg-[var(--danger-900)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}

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
      </div>
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