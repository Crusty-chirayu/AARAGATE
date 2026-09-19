"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  Pencil,
  RefreshCw,
  ShieldAlert,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { Avatar, AiAvatar, AiPill } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Markdown } from "./markdown";
import { AttachmentChip } from "./attachment-chip";
import { CitationList } from "./citation-list";
import type { Message, Profile, Reaction } from "@/lib/types";
import type { ReadReceipt } from "@/lib/read-receipts";
import { readReceiptLabel } from "@/lib/read-receipts";
import { cn, clockTime } from "@/lib/utils";
import { messageIn, popIn, popover, SPRING, tEnter } from "@/lib/motion";

const QUICK_EMOJI = ["👍", "🎉", "❤️", "😂", "🤔", "👀"];

/**
 * The in-flight assistant reply, published outside React state.
 *
 * `ChatView` owns the buffer and pushes a new value at most once per animation
 * frame. Subscribing here (rather than passing the text as a prop) means a
 * streaming delta re-renders only the bubble's text node — not the transcript
 * around it. Measured on the §2.7 harness: re-rendering the parent per delta
 * cost ~27% of CPU in React element creation plus framer-motion layout
 * measurement for every row, producing 2.7–3.5 s blocking spells at 4× CPU
 * throttle; isolating the subscriber removed them (see `perf.spec.ts`).
 */
export interface StreamingTextSource {
  get(): string;
  subscribe(onStoreChange: () => void): () => void;
}

/** Streaming caret, or the "thinking" dots before the first token lands. */
function StreamTail({ text }: { text: string }) {
  if (text.length > 0) return <span className="stream-caret" />;
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((d) => (
        <span
          key={d}
          className="typing-dot h-1.5 w-1.5 rounded-full"
          style={{ animationDelay: `${d * 140}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Renders the streamed reply as plain text. Markdown is deliberately NOT
 * parsed per delta — the growing document is re-parsed once, when the message
 * completes and `Markdown` takes over (see the body branch below).
 */
const StreamingText = React.memo(function StreamingText({
  source,
}: {
  source: StreamingTextSource;
}) {
  const text = React.useSyncExternalStore(source.subscribe, source.get, source.get);
  return (
    <>
      <span className="whitespace-pre-wrap">{text}</span>
      <StreamTail text={text} />
    </>
  );
});

export interface MessageItemProps {
  message: Message;
  author: Profile | null;
  isOwn: boolean;
  isGroup: boolean;
  showHeader: boolean;
  streaming: boolean;
  reactions: Reaction[];
  currentUserId: string;
  highlighted?: boolean;
  canRegenerate: boolean;
  readReceipt?: ReadReceipt | null;
  /** Live text for the in-flight reply. Stable identity — see `StreamingTextSource`. */
  streamText?: StreamingTextSource | null;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
}

export const MessageItem = React.memo(function MessageItem({
  message,
  author,
  isOwn,
  isGroup,
  showHeader,
  streaming,
  reactions,
  currentUserId,
  highlighted,
  canRegenerate,
  readReceipt,
  streamText,
  onReact,
  onEdit,
  onDelete,
  onRegenerate,
}: MessageItemProps) {
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(message.content);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const isAi = message.sender_type === "ai";
  const blocked = message.status === "blocked";
  const errored = message.status === "error";

  const grouped = React.useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.user_id === currentUserId) cur.mine = true;
      map.set(r.emoji, cur);
    }
    return [...map.entries()];
  }, [reactions, currentUserId]);

  const copy = async () => {
    try {
      // While streaming, the persisted row is still empty — copy what the user
      // can actually see in the bubble.
      const text = streaming && streamText ? streamText.get() : message.content;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const saveEdit = () => {
    const v = draft.trim();
    if (v && v !== message.content) onEdit(message.id, v);
    setEditing(false);
  };

  const name = isAi ? "Assistant" : (author?.display_name ?? (isOwn ? "You" : "Unknown"));

  return (
    <motion.div
      layout="position"
      variants={messageIn}
      initial="hidden"
      animate="show"
      transition={SPRING}
      id={`msg-${message.id}`}
      className={cn(
        "group relative flex gap-3 rounded-[var(--r-md)] px-2 py-1.5 transition-colors duration-[var(--d-standard)]",
        showHeader ? "mt-4" : "mt-0.5",
        highlighted ? "bg-[var(--accent-subtle)]" : "hover:bg-[var(--bg-hover)]/50",
      )}
    >
      {/* gutter: avatar or hover timestamp */}
      <div className="w-8 shrink-0">
        {showHeader ? (
          isAi ? (
            <AiAvatar size="sm" />
          ) : (
            <Avatar name={name} url={author?.avatar_url} size="sm" />
          )
        ) : (
          <span className="mt-1 hidden text-[10px] tabular-nums text-[var(--fg-subtle)] opacity-0 transition-opacity duration-[var(--d-micro)] group-hover:opacity-100 sm:block">
            {clockTime(message.created_at)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="mb-0.5 flex items-baseline gap-2">
            <span
              className={cn(
                "text-[13px] font-semibold",
                isAi ? "text-[var(--ai-accent)]" : "text-[var(--fg)]",
              )}
            >
              {name}
            </span>
            {isAi && (
              <AiPill />
            )}
            {isGroup && !isAi && isOwn && (
              <span className="text-[10.5px] text-[var(--fg-subtle)]">you</span>
            )}
            <span className="text-[11px] tabular-nums text-[var(--fg-subtle)]">
              {clockTime(message.created_at)}
            </span>
            {message.edited_at && (
              <span className="text-[10.5px] text-[var(--fg-subtle)]">(edited)</span>
            )}
          </div>
        )}

        {/* body */}
        {editing ? (
          <div className="space-y-2 py-1">
            <Textarea
              value={draft}
              rows={Math.min(12, draft.split("\n").length + 1)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit}>
                <Check className="h-3.5 w-3.5" />
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : blocked ? (
          <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--warning)]/30 bg-[var(--warning-subtle)] px-3 py-2.5 text-[13px] text-[var(--warning)] shadow-[var(--e1)]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">Withheld by the safety filter.</strong> This content
              didn&apos;t pass moderation, so it wasn&apos;t published to the room.
            </span>
          </div>
        ) : errored ? (
          <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--danger)]/30 bg-[var(--danger-subtle)] px-3 py-2.5 text-[13px] text-[var(--danger)] shadow-[var(--e1)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message.content || "The assistant couldn't respond."}</span>
          </div>
        ) : (
          /* §2.2/§2.5: real bubbles — a background container carries the
             sender identity. AI = teal, own = brand accent, others = neutral.
             A hairline inset ring (rather than a heavier outer border) gives
             AI/other bubbles a touch of edge definition and material depth
             without competing with the message content; the solid own-
             message bubble stays clean and unadorned. */
          <div
            className={cn(
              "bubble inline-block max-w-[68ch] rounded-[var(--r-lg)] px-3.5 py-2.5 text-[14px] leading-[1.5] shadow-[var(--e1)] transition-shadow duration-[var(--d-standard)] group-hover:shadow-[var(--e2)]",
              message.status === "superseded" && "opacity-45",
              isAi
                ? "bg-[var(--bubble-ai-bg)] text-[var(--bubble-ai-fg)] ring-1 ring-inset ring-[var(--bubble-ai-ring)]/25"
                : isOwn
                  ? "bg-[var(--bubble-user-bg)] text-[var(--bubble-user-fg)]"
                  : "bg-[var(--bubble-other-bg)] text-[var(--bubble-other-fg)] ring-1 ring-inset ring-[var(--border)]/60",
            )}
          >
            {/* While streaming, render plain text: re-parsing the growing
                markdown on every animation frame is the single largest
                main-thread cost of the streaming path (§2.7). The full
                markdown render happens once, when the message completes.
                With a live source the text node subscribes to it itself, so a
                delta re-renders that node and nothing else in the transcript. */}
            {streaming ? (
              streamText ? (
                <StreamingText source={streamText} />
              ) : (
                <>
                  <span className="whitespace-pre-wrap">{message.content}</span>
                  <StreamTail text={message.content} />
                </>
              )
            ) : (
              <Markdown content={message.content} />
            )}
            {/* verified sources — server-derived, rendered only when present */}
            {!streaming && <CitationList citations={message.citations} />}
          </div>
        )}

        {/* attachments — private, member-scoped (§19/§35) */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} />
            ))}
          </div>
        )}

        {/* read receipt — only for the sender's own human messages in a room */}
        {readReceipt && (
          <div className="mt-1 flex items-center gap-1 pl-1" aria-live="polite">
            <Check className="h-3 w-3 text-[var(--info)]" aria-hidden />
            <span className="text-[10.5px] text-[var(--fg-subtle)]">
              {readReceiptLabel(readReceipt) || "Sent"}
            </span>
          </div>
        )}

        {/* reactions */}
        {grouped.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            <AnimatePresence initial={false}>
              {grouped.map(([emoji, info]) => (
                <motion.button
                  key={emoji}
                  variants={popIn}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  whileTap={{ scale: 0.92 }}
                  transition={SPRING}
                  onClick={() => onReact(message.id, emoji)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] transition-colors duration-[var(--d-micro)]",
                    info.mine
                      ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]",
                  )}
                >
                  <span>{emoji}</span>
                  <span className="tabular-nums font-medium">{info.count}</span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* hover actions — opacity fade only, no layout shift */}
      {!editing && !streaming && (
        <div
          className={cn(
            "absolute -top-3 right-2 flex items-center gap-0.5 rounded-[var(--r-md)] border border-[var(--border)]",
            "bg-[var(--surface-raised)]/95 p-0.5 opacity-0 shadow-[var(--e2)] backdrop-blur-sm transition-opacity duration-[var(--d-micro)]",
            "group-hover:opacity-100 focus-within:opacity-100",
          )}
        >
          <div className="relative">
            <IconAction
              label="Add reaction"
              onClick={() => setPickerOpen((o) => !o)}
              icon={SmilePlus}
            />
            <AnimatePresence>
              {pickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                  <motion.div
                    variants={popover}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    className="absolute right-0 top-9 z-20 flex gap-0.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-raised)]/95 p-1 shadow-[var(--e3)] backdrop-blur-sm"
                  >
                    {QUICK_EMOJI.map((e) => (
                      <motion.button
                        key={e}
                        whileHover={{ scale: 1.22 }}
                        whileTap={{ scale: 0.92 }}
                        transition={SPRING}
                        onClick={() => {
                          onReact(message.id, e);
                          setPickerOpen(false);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[15px] hover:bg-[var(--bg-hover)]"
                      >
                        {e}
                      </motion.button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <IconAction
            label={copied ? "Copied" : "Copy"}
            onClick={copy}
            icon={copied ? Check : Copy}
            accent={copied}
          />

          {isAi && canRegenerate && (
            <IconAction label="Regenerate" onClick={() => onRegenerate(message.id)} icon={RefreshCw} />
          )}

          {isOwn && !isAi && (
            <>
              <IconAction
                label="Edit"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
                icon={Pencil}
              />
              <IconAction label="Delete" onClick={() => onDelete(message.id)} icon={Trash2} danger />
            </>
          )}
        </div>
      )}
    </motion.div>
  );
});

function IconAction({
  label,
  onClick,
  icon: Icon,
  danger,
  accent,
}: {
  label: string;
  onClick: () => void;
  icon: React.ElementType;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.9 }}
      transition={tEnter(0.12)}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-[var(--r-sm)] transition-colors duration-[var(--d-micro)]",
        danger
          ? "text-[var(--fg-muted)] hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)]"
          : accent
            ? "text-[var(--success)]"
            : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </motion.button>
  );
}