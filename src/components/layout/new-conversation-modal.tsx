"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createConversation } from "@/lib/data/api";
import type { AiMode } from "@/lib/types";
import { cn } from "@/lib/utils";

const AI_MODES: Array<{ v: AiMode; label: string; body: string }> = [
  { v: "off", label: "Off", body: "Humans only. The assistant never posts." },
  {
    v: "mention_only",
    label: "On mention",
    body: "Answers only when someone mentions the assistant.",
  },
  { v: "auto", label: "Auto", body: "Answers every message. Best for small groups." },
];

export function NewConversationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<"direct_ai" | "group">("direct_ai");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [aiMode, setAiMode] = useState<AiMode>("mention_only");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setKind("direct_ai");
    setName("");
    setTopic("");
    setAiMode("mention_only");
    setError(null);
    setLoading(false);
  };

  const close = () => {
    onClose();
    setTimeout(reset, 260);
  };

  const create = async () => {
    if (kind === "group" && name.trim().length < 2) {
      setError("Give the room a name.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const id = await createConversation(
        kind === "group"
          ? { type: "group", name: name.trim(), topic: topic.trim() || null, ai_mode: aiMode }
          : { type: "direct_ai", ai_mode: "auto" },
      );
      onCreated?.();
      close();
      router.push(`/app/c/${id}`);
    } catch (e) {
      setLoading(false);
      toast.push({ kind: "error", title: "Couldn't create", description: String(e) });
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="New chat"
      description="A private chat with the tutor, or a study room you can invite your batch to."
      className="overflow-hidden border-[var(--border)]/70 bg-[var(--bg-elevated)] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_24px_60px_-20px_rgba(0,0,0,0.55)] backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--bg-elevated)]/85"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={create} loading={loading}>
            {kind === "group" ? "Create room" : "Start chat"}
          </Button>
        </>
      }
    >
      {/* ambient top sheen — purely decorative, non-interactive */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--accent)]/[0.06] to-transparent"
      />

      <div className="relative space-y-6">
        <div>
          <p className="mb-2 text-[13px] font-medium tracking-[-0.005em] text-[var(--fg)]">
            What are you creating?
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                v: "direct_ai" as const,
                icon: MessagesSquare,
                title: "Chat with AI",
                body: "Private, just you and the assistant.",
              },
              {
                v: "group" as const,
                icon: Users,
                title: "Study room",
                body: "Invite your batch; the assistant joins on your terms.",
              },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setKind(o.v)}
                className={cn(
                  "group relative overflow-hidden rounded-[var(--r-lg)] border p-4 text-left transition-all duration-[var(--d-micro)]",
                  kind === o.v
                    ? "border-[var(--accent)]/60 bg-[var(--accent-subtle)] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]"
                    : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]",
                )}
              >
                <o.icon
                  className={cn(
                    "mb-2 h-5 w-5 transition-colors duration-[var(--d-micro)]",
                    kind === o.v ? "text-[var(--accent-text)]" : "text-[var(--fg-muted)] group-hover:text-[var(--fg)]",
                  )}
                />
                <p className="text-[13.5px] font-semibold text-[var(--fg)]">{o.title}</p>
                <p className="mt-1 text-[12px] leading-snug text-[var(--fg-muted)]">{o.body}</p>
              </button>
            ))}
          </div>
        </div>

        {kind === "group" && (
          <div className="space-y-5 rounded-[var(--r-lg)] border border-[var(--border)]/70 bg-[var(--bg-subtle)]/40 p-4">
            <Field label="Room name" error={error} id="room-name">
              <Input
                id="room-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="GATE 2027 — Signals & Systems"
                autoFocus
              />
            </Field>

            <Field
              label="Topic"
              hint="Optional — shapes how the assistant answers here."
              id="room-topic"
            >
              <Textarea
                id="room-topic"
                rows={2}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What this group is for"
              />
            </Field>

            <div>
              <p className="mb-2 text-[13px] font-medium tracking-[-0.005em] text-[var(--fg)]">
                AI participation
              </p>
              <div className="space-y-1.5">
                {AI_MODES.map((m) => (
                  <button
                    key={m.v}
                    type="button"
                    onClick={() => setAiMode(m.v)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-[var(--r-md)] border p-3 text-left transition-all duration-[var(--d-micro)]",
                      aiMode === m.v
                        ? "border-[var(--accent)]/60 bg-[var(--accent-subtle)] shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset]"
                        : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition-colors duration-[var(--d-micro)]",
                        aiMode === m.v ? "border-[var(--accent)]" : "border-[var(--border-strong)]",
                      )}
                    >
                      {aiMode === m.v && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[var(--fg)]">{m.label}</span>
                      <span className="block text-[12px] leading-snug text-[var(--fg-muted)]">
                        {m.body}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}