"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Hash, Settings2, Sparkles, Users } from "lucide-react";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";
import { RoomSettingsModal } from "./room-settings-modal";
import { StreamAnnouncer } from "./stream-announcer";
import { AiModeBadge } from "@/components/layout/sidebar";
import { AiAvatar, Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageListSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/session-provider";
import { useNetworkStatus } from "@/components/network-provider";
import { DEMO_MODE } from "@/lib/env";
import { demo } from "@/lib/data/demo-store";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  deleteMessage,
  editMessage,
  invokeAi,
  listMembers,
  listMessages,
  listReactions,
  markRead,
  sendMessage,
  toggleReaction,
  uploadAttachment,
  type AiHandle,
} from "@/lib/data/api";
import type { Conversation, ConversationMember, Message, Reaction } from "@/lib/types";
import { cn, conversationTitle, dayLabel, shouldInvokeAi } from "@/lib/utils";
import { computeReadReceipt, type ReadReceipt } from "@/lib/read-receipts";
import { tEnter, tExit } from "@/lib/motion";

/** Stable empty list so memoised rows don't see a fresh array each render. */
const NO_REACTIONS: Reaction[] = [];

/**
 * Do two reads of the same row render identically?
 *
 * The data layer mints fresh objects for every row on every read, so
 * `load()` used to hand every memoised `MessageItem` a new `message`
 * reference and re-render the whole transcript even when only one row had
 * changed. Comparing the fields a row actually renders lets the previous
 * object be reused, which keeps `memo` (and its markdown) intact.
 */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameRow(a: Message, b: Message): boolean {
  return (
    a.id === b.id &&
    a.content === b.content &&
    a.status === b.status &&
    a.created_at === b.created_at &&
    a.edited_at === b.edited_at &&
    a.deleted_at === b.deleted_at &&
    a.sender_id === b.sender_id &&
    a.sender_type === b.sender_type &&
    sameJson(a.attachments, b.attachments) &&
    sameJson(a.citations, b.citations)
  );
}

/**
 * The in-flight assistant reply, held OUTSIDE React state.
 *
 * Streaming publishes at most once per animation frame. As `useState` that
 * value re-rendered this whole component — and therefore re-created elements
 * for the entire transcript plus the header/composer chrome — on every frame.
 * Profiling the §2.7 harness showed ~27% of CPU inside React's element
 * factories and multi-second blocking spells under 4× CPU throttle. Here only
 * the subscribers re-render: the streaming bubble's text node and the
 * screen-reader announcer.
 */
function createStreamSource() {
  let text = "";
  const listeners = new Set<() => void>();
  return {
    get: () => text,
    set(next: string) {
      if (next === text) return;
      text = next;
      listeners.forEach((l) => l());
    },
    subscribe(onStoreChange: () => void) {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
  };
}
type StreamSource = ReturnType<typeof createStreamSource>;

/**
 * Adapts the stream source to `StreamAnnouncer`'s plain-string prop, so the
 * announcer keeps its own (unit-tested) API and only this adapter re-renders
 * as the reply grows.
 */
const LiveAnnouncer = React.memo(function LiveAnnouncer({
  source,
  active,
}: {
  source: StreamSource;
  active: boolean;
}) {
  const text = React.useSyncExternalStore(source.subscribe, source.get, source.get);
  return <StreamAnnouncer text={text} active={active} />;
});

export function ChatView({ conversation: initial }: { conversation: Conversation }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { profile } = useSession();
  const { unavailable } = useNetworkStatus();
  const highlightId = params.get("m");

  const [conversation, setConversation] = React.useState(initial);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [members, setMembers] = React.useState<ConversationMember[]>([]);
  const [reactions, setReactions] = React.useState<Reaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [streamingId, setStreamingId] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [processingAttachments, setProcessingAttachments] = React.useState(false);
  // The in-flight reply text is intentionally NOT state — see createStreamSource.
  const [streamSource] = React.useState(createStreamSource);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [atBottom, setAtBottom] = React.useState(true);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const aiHandle = React.useRef<AiHandle | null>(null);
  const sendingRef = React.useRef(false);

  // Coalesce stream deltas into one publish per animation frame. The demo
  // streamer fires onDelta every ~20-60ms; without coalescing each delta
  // re-renders the streaming bubble, which under CPU throttle turns into
  // multi-hundred-ms main-thread blocking spells (§2.7).
  const streamBuf = React.useRef("");
  const streamRaf = React.useRef(0);
  const streamTextRef = React.useRef("");
  const flushStream = React.useCallback(() => {
    streamRaf.current = 0;
    const chunk = streamBuf.current;
    if (!chunk) return;
    streamBuf.current = "";
    streamTextRef.current += chunk;
    streamSource.set(streamTextRef.current);
  }, [streamSource]);
  const queueDelta = React.useCallback(
    (chunk: string) => {
      streamBuf.current += chunk;
      if (!streamRaf.current) streamRaf.current = requestAnimationFrame(flushStream);
    },
    [flushStream],
  );
  const cancelStreamRender = React.useCallback(() => {
    // Flush any buffered deltas synchronously before tearing down: the demo
    // streamer can call onDone immediately after its last onDelta, so a
    // pending rAF (and its buffer) still holds the tail of the reply.
    // Discarding it here used to swallow the final streamed chunk.
    if (streamRaf.current) cancelAnimationFrame(streamRaf.current);
    streamRaf.current = 0;
    const chunk = streamBuf.current;
    streamBuf.current = "";
    if (chunk) {
      streamTextRef.current += chunk;
      streamSource.set(streamTextRef.current);
    }
  }, [streamSource]);
  /** Drop the in-flight text (start of a new reply, or once it is persisted). */
  const resetStreamText = React.useCallback(() => {
    streamTextRef.current = "";
    streamSource.set("");
  }, [streamSource]);
  const isGroup = conversation.type === "group";
  const uid = profile?.id ?? "";

  const me = members.find((m) => m.user_id === uid);
  const isAdmin = me?.role === "owner" || me?.role === "admin";

  /* ---------------- load ---------------- */
  const readAll = React.useCallback(async () => {
    const [msgs, mems, reacts] = await Promise.all([
      listMessages(conversation.id),
      listMembers(conversation.id),
      listReactions(conversation.id),
    ]);
    setMessages(msgs);
    setMembers(mems);
    setReactions(reacts);
    setLoading(false);
  }, [conversation.id]);

  // One reply triggers several refreshes — every demo-store commit notifies and
  // the stream callbacks refresh too. Coalesce them: a trigger that arrives
  // while a read is in flight queues a single follow-up read rather than
  // stacking a full transcript re-render per trigger.
  const loadState = React.useRef<{ inFlight: Promise<void> | null; queued: boolean }>({
    inFlight: null,
    queued: false,
  });
  const load = React.useCallback(
    async (readAllArg: () => Promise<void> = readAll): Promise<void> => {
      const s = loadState.current;
      if (s.inFlight) {
        s.queued = true;
        return s.inFlight;
      }
      const run = readAllArg();
      s.inFlight = run;
      try {
        await run;
      } finally {
        s.inFlight = null;
      }
      if (s.queued) {
        s.queued = false;
        await readAllArg(); // fresh follow-up read absorbs triggers queued meanwhile
      }
    },
    [readAll],
  );

  React.useEffect(() => {
    setLoading(true);
    void load();
    void markRead(conversation.id);
  }, [load, conversation.id]);

  React.useEffect(() => setConversation(initial), [initial]);

  /* ---------------- realtime ---------------- */
  React.useEffect(() => {
    if (DEMO_MODE) return demo.subscribe(() => void load());

    const supa = getSupabaseBrowser();
    if (!supa || !profile) return;

    const channel = supa
      .channel(`conv:${conversation.id}`, { config: { presence: { key: uid } } })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => {
            if (payload.eventType === "INSERT") {
              return prev.some((m) => m.id === row.id) ? prev : [...prev, row];
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((m) => (m.id === row.id ? { ...m, ...row } : m));
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((m) => m.id !== (payload.old as Message).id);
            }
            return prev;
          });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, () => {
        void listReactions(conversation.id).then(setReactions);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => {
        // Last-read timestamps (read receipts) live here — refresh when they change.
        void listMembers(conversation.id).then(setMembers);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { user_id, name } = payload as { user_id: string; name: string };
        if (user_id === profile.id) return;
        setTypingUsers((prev) => (prev.includes(name) ? prev : [...prev, name]));
        setTimeout(() => setTypingUsers((prev) => prev.filter((n) => n !== name)), 3200);
      })
      .subscribe();

    return () => {
      void supa.removeChannel(channel);
    };
  }, [conversation.id, profile, load]);

  /* ---------------- rows ---------------- */
  // Reuse the previous object for rows whose renderable state is unchanged, so
  // a refresh that touched one row (the streamed reply) doesn't re-render the
  // rest of the transcript — see `sameRow`. The stable identity also keeps
  // `handleRegenerate` stable, which is what lets memoised rows bail out.
  // (The cache lives in a ref updated in an effect, so render stays pure.)
  const rowsRef = React.useRef<Message[]>([]);
  const [rows, setRows] = React.useState<Message[]>([]);
  React.useEffect(() => {
    const prev = new Map(rowsRef.current.map((m) => [m.id, m]));
    const next = messages.map((m) => {
      const old = prev.get(m.id);
      const kept = old && sameRow(old, m) ? old : m;
      return kept;
    });
    rowsRef.current = next;
    setRows(next);
  }, [messages]);

  /* ---------------- scroll ---------------- */
  const scrollToBottom = React.useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  React.useEffect(() => {
    if (atBottom) scrollToBottom(false);
  }, [rows.length, atBottom, scrollToBottom]);

  // Follow the growing reply while streaming. Reads `atBottom` through a ref so
  // the subscription is stable across scroll state changes, and coalesces the
  // write to one per frame so a burst of deltas can't queue several scrolls.
  const atBottomRef = React.useRef(atBottom);
  React.useEffect(() => {
    atBottomRef.current = atBottom;
  }, [atBottom]);
  const scrollRaf = React.useRef(0);
  React.useEffect(() => {
    const unsubscribe = streamSource.subscribe(() => {
      if (!atBottomRef.current || scrollRaf.current) return;
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = 0;
        scrollToBottom(false);
      });
    });
    return () => {
      unsubscribe();
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    };
  }, [streamSource, scrollToBottom]);

  React.useEffect(() => {
    if (!loading && highlightId) {
      const el = document.getElementById(`msg-${highlightId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading, highlightId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  };

  /* ---------------- AI ---------------- */
  const runAi = React.useCallback(
    async (prompt: string, triggerId?: string, supersedesId?: string) => {
      resetStreamText();
      const handle = await invokeAi(
        conversation.id,
        {
          triggerMessageId: triggerId,
          supersedesId,
          isGroup,
          roomName: conversation.name,
          prompt,
        },
        {
          onStart: (id) => {
            setStreamingId(id);
            if (DEMO_MODE) void load();
          },
          onDelta: queueDelta,
          onDone: () => {
            cancelStreamRender();
            setStreamingId(null);
            resetStreamText();
            void load();
          },
          onBlocked: () => {
            cancelStreamRender();
            setStreamingId(null);
            resetStreamText();
            toast.push({
              kind: "warning",
              title: "Response withheld",
              description: "The answer didn't pass moderation.",
            });
            void load();
          },
          onError: (msg) => {
            cancelStreamRender();
            setStreamingId(null);
            resetStreamText();
            toast.push({ kind: "error", title: "The assistant failed", description: msg });
            void load();
          },
        },
      );
      aiHandle.current = handle;
    },
    [
      conversation.id,
      conversation.name,
      isGroup,
      load,
      toast,
      queueDelta,
      cancelStreamRender,
      resetStreamText,
    ],
  );

  const handleSend = async (text: string, files: File[]) => {
    setAtBottom(true);
    // In real (Supabase) mode we must not pretend a message reached the server
    // while the connection is down. Demo mode is localStorage-backed, so a
    // send works offline — but we still tell the user they're offline.
    if (unavailable && !DEMO_MODE) {
      toast.push({
        kind: "warning",
        title: "You're offline",
        description: "Reconnect before sending — your message hasn't been sent yet.",
      });
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setProcessingAttachments(files.length > 0);
    try {
      const msg = await sendMessage(conversation.id, text);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      // Each upload resolves only after its document is ready for retrieval.
      for (const file of files) {
        await uploadAttachment(conversation.id, msg.id, file);
      }
      if (files.length > 0) void load();
      if (shouldInvokeAi(text, conversation.ai_mode)) {
        await runAi(text, msg.id);
      }
    } catch (e) {
      void load();
      toast.push({ kind: "error", title: "Couldn't send", description: String(e) });
    } finally {
      sendingRef.current = false;
      setSending(false);
      setProcessingAttachments(false);
    }
  };

  const handleStop = () => {
    aiHandle.current?.stop();
    aiHandle.current = null;
    cancelStreamRender();
    setStreamingId(null);
    resetStreamText();
    void load();
  };

  const handleRegenerate = React.useCallback(
    async (messageId: string) => {
      const idx = rows.findIndex((m) => m.id === messageId);
      const prompt =
        [...rows.slice(0, idx)].reverse().find((m) => m.sender_type === "human")?.content ?? "";
      setAtBottom(true);
      await runAi(prompt, undefined, messageId);
    },
    [rows, runAi],
  );

  // Per-message actions take the message id so their identities are stable
  // across renders — MessageItem is memoised, and fresh closures here would
  // re-render every row on each stream delta.
  const handleReact = React.useCallback(
    async (messageId: string, emoji: string) => {
      await toggleReaction(messageId, emoji);
      setReactions(await listReactions(conversation.id));
    },
    [conversation.id],
  );

  const handleEdit = React.useCallback(
    async (messageId: string, content: string) => {
      await editMessage(messageId, content);
      void load();
    },
    [load],
  );

  const handleDeleteMessage = React.useCallback(
    async (messageId: string) => {
      await deleteMessage(messageId);
      void load();
    },
    [load],
  );

  const broadcastTyping = React.useRef(0);
  const handleTyping = () => {
    if (DEMO_MODE || !isGroup || !profile) return;
    const now = Date.now();
    if (now - broadcastTyping.current < 1800) return;
    broadcastTyping.current = now;
    void getSupabaseBrowser()
      ?.channel(`conv:${conversation.id}`)
      .send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: profile.id, name: profile.display_name },
      });
  };

  /* ---------------- derived ---------------- */
  const profilesById = React.useMemo(() => {
    const map = new Map<string, ConversationMember["profile"]>();
    members.forEach((m) => m.profile && map.set(m.user_id, m.profile));
    return map;
  }, [members]);

  const visible = React.useMemo(
    () => rows.filter((m) => !m.deleted_at && m.status !== "superseded"),
    [rows],
  );

  // Group per-message payloads once so each memoised MessageItem receives
  // referentially stable props across stream-delta re-renders.
  const reactionsByMessage = React.useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const r of reactions) {
      const list = map.get(r.message_id);
      if (list) list.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  const receiptsById = React.useMemo(() => {
    const map = new Map<string, ReadReceipt>();
    if (isGroup) {
      for (const m of visible) {
        if (m.sender_type === "human" && m.sender_id === uid) {
          map.set(m.id, computeReadReceipt(m, members, uid));
        }
      }
    }
    return map;
  }, [visible, members, uid, isGroup]);

  const title = conversationTitle(conversation);
  const canRegenerate = !streamingId;

  return (
    <div className="relative flex h-full flex-col bg-[var(--bg-app)]">
      {/* ---------- header ---------- */}
      <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4">
        {isGroup ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface-raised)] text-[var(--fg-muted)]">
            <Hash className="h-4 w-4" />
          </span>
        ) : (
          <AiAvatar size="sm" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[14.5px] font-semibold tracking-[-0.005em]">{title}</h1>
            <AiModeBadge mode={conversation.ai_mode} />
          </div>
          <p className="truncate text-[11.5px] text-[var(--fg-muted)]">
            {isGroup
              ? conversation.topic ||
                `${members.length} member${members.length === 1 ? "" : "s"}`
              : "Private conversation with the assistant"}
          </p>
        </div>

        {isGroup && (
          <div className="hidden items-center -space-x-1.5 sm:flex">
            {members.slice(0, 4).map((m) => (
              <Avatar
                key={m.user_id}
                name={m.profile?.display_name ?? "?"}
                url={m.profile?.avatar_url}
                size="xs"
                className="ring-2 ring-[var(--bg)]"
              />
            ))}
            {members.length > 4 && (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--bg-active)] text-[10px] font-semibold text-[var(--fg-muted)] ring-2 ring-[var(--bg)]">
                +{members.length - 4}
              </span>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="press-fluid"
          onClick={() => setSettingsOpen(true)}
          aria-label={isGroup ? "Group settings" : "Conversation settings"}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </header>

      {/* ---------- messages ---------- */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full scroll-smooth overflow-y-auto overscroll-contain px-2 pb-6 sm:px-6"
        >
          {loading ? (
            <MessageListSkeleton />
          ) : visible.length === 0 ? (
            <EmptyState isGroup={isGroup} aiMode={conversation.ai_mode} />
          ) : (
            <div
              className="mx-auto max-w-4xl"
              role="log"
              aria-label={isGroup ? `Messages in ${title}` : "Conversation with the assistant"}
            >
              {visible.map((m, i) => {
                const prev = visible[i - 1];
                const newDay =
                  !prev ||
                  new Date(prev.created_at).toDateString() !==
                    new Date(m.created_at).toDateString();
                const showHeader =
                  newDay ||
                  !prev ||
                  prev.sender_id !== m.sender_id ||
                  prev.sender_type !== m.sender_type ||
                  new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() >
                    5 * 60_000;

                const isStreaming = m.id === streamingId;

                return (
                  <React.Fragment key={m.id}>
                    {newDay && (
                      <div className="sticky top-2 z-10 my-4 flex justify-center">
                        <span className="rounded-full border border-[var(--border)]/70 bg-[var(--surface)]/80 px-3 py-1 text-[11px] font-medium tracking-[-0.005em] text-[var(--fg-muted)] shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,var(--e1)] backdrop-blur-sm">
                          {dayLabel(m.created_at)}
                        </span>
                      </div>
                    )}
                    <MessageItem
                      message={m}
                      author={
                        m.sender_id ? (profilesById.get(m.sender_id) ?? null) : null
                      }
                      isOwn={m.sender_id === uid}
                      isGroup={isGroup}
                      showHeader={showHeader}
                      streaming={isStreaming}
                      streamText={isStreaming ? streamSource : null}
                      highlighted={m.id === highlightId}
                      currentUserId={uid}
                      canRegenerate={canRegenerate}
                      reactions={reactionsByMessage.get(m.id) ?? NO_REACTIONS}
                      readReceipt={receiptsById.get(m.id) ?? null}
                      onReact={handleReact}
                      onEdit={handleEdit}
                      onDelete={handleDeleteMessage}
                      onRegenerate={handleRegenerate}
                    />
                  </React.Fragment>
                );
              })}

              {/* typing indicator */}
              <AnimatePresence>
                {typingUsers.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: tExit() }}
                    transition={tEnter(0.2)}
                    className="mt-1 flex w-fit items-center gap-2 rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/60 px-3 py-1.5 backdrop-blur-sm"
                  >
                    <div className="flex w-8 justify-center">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="typing-dot mx-px h-1.5 w-1.5 rounded-full bg-[var(--fg-subtle)]"
                          style={{ animationDelay: `${d * 140}ms` }}
                        />
                      ))}
                    </div>
                    <span className="text-[12px] text-[var(--fg-muted)]">
                      {typingUsers.slice(0, 2).join(" and ")}
                      {typingUsers.length > 2 ? ` and ${typingUsers.length - 2} more` : ""}{" "}
                      {typingUsers.length === 1 ? "is" : "are"} typing…
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="h-2" />
            </div>
          )}
        </div>

        {/* jump to latest */}
        <AnimatePresence>
          {!atBottom && !loading && (
            <motion.button
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.94, transition: tExit() }}
              transition={tEnter(0.2)}
              onClick={() => {
                setAtBottom(true);
                scrollToBottom();
              }}
              className="press-fluid absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--border)]/80 bg-[var(--surface-raised)]/90 px-3.5 py-2 text-[12.5px] font-medium shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,var(--e3)] backdrop-blur-md transition-colors duration-[var(--d-micro)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Jump to latest
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* §10: batched aria-live announcements for streamed tokens */}
      <LiveAnnouncer source={streamSource} active={Boolean(streamingId)} />

      {/* ---------- composer ---------- */}
      <Composer
        members={members}
        isGroup={isGroup}
        aiMode={conversation.ai_mode}
        streaming={Boolean(streamingId)}
        busy={sending}
        busyLabel={
          processingAttachments ? "Uploading and processing attachments…" : "Sending message…"
        }
        initialValue={params.get("prefill") ?? undefined}
        onSend={handleSend}
        onStop={handleStop}
        onTyping={handleTyping}
      />

      <RoomSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        conversation={conversation}
        members={members}
        isAdmin={Boolean(isAdmin)}
        currentUserId={uid}
        onChanged={async () => {
          await load();
          router.refresh();
        }}
        onLeft={() => router.push("/app")}
      />
    </div>
  );
}

function EmptyState({ isGroup, aiMode }: { isGroup: boolean; aiMode: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tEnter(0.32)}
      className="mx-auto flex h-full max-w-lg flex-col items-center justify-center px-6 text-center"
    >
      <span
        className={cn(
          "mb-4 grid h-14 w-14 place-items-center rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs",
          isGroup ? "text-[var(--accent-text)]" : "text-[var(--ai-teal-500)]",
        )}
      >
        {isGroup ? <Users className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </span>
      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--fg)]">
        {isGroup ? "Academic Study Room" : "What's on your mind?"}
      </h2>
      <p className="mt-2 text-pretty text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
        {isGroup
          ? aiMode === "off"
            ? "Collaborate with your batchmates. AI participation is turned off in this room."
            : aiMode === "mention_only"
              ? "Study with your peers. Mention @ai when you need worked mathematical solutions or doubt resolution."
              : "Active study seminar: the tutor participates in discussions and solves doubts for the room."
          : "Ask your conceptual doubts, paste GATE examination problems, or request step-by-step mathematical derivations grounded in your syllabus notes."}
      </p>
    </motion.div>
  );
}