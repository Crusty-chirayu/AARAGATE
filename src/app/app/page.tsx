"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, Bot, FolderOpen, Hash, Search, Sparkles, UserPlus } from "lucide-react";

import { Logo } from "@/components/logo";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/ui/toast";
import { createConversation } from "@/lib/data/api";
import { DEMO_MODE } from "@/lib/env";
import { riseIn, staggerParent, tEnter } from "@/lib/motion";

const PROMPTS = [
  "Explain LRU page replacement algorithm with a step-by-step example",
  "Give me 5 GATE-level questions on database normalization with answer keys",
  "Step-by-step derivation of eigenvalues & eigenvectors for symmetric matrices",
  "Settle a debate: quicksort vs mergesort for GATE MCQs — what do I pick when?",
];

export default function AppHomePage() {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [busy, setBusy] = React.useState(false);

  const startChat = async (seed?: string) => {
    setBusy(true);
    try {
      const id = await createConversation({ type: "direct_ai", ai_mode: "auto" });
      router.push(seed ? `/app/c/${id}?prefill=${encodeURIComponent(seed)}` : `/app/c/${id}`);
    } catch (e) {
      setBusy(false);
      toast.push({ kind: "error", title: "Couldn't start a chat", description: String(e) });
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (profile?.display_name ?? "there").split(/\s+/)[0];

  return (
    <div className="min-h-full bg-[var(--bg-app)]">
      <motion.div
        variants={staggerParent(0.05)}
        initial="hidden"
        animate="show"
        className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-12"
      >
        <motion.div variants={riseIn} className="mb-8 text-center">
          <Logo animated className="mx-auto mb-4 h-11 w-11" />
          <h1 className="font-editorial text-2xl font-bold tracking-tight text-[var(--fg)] sm:text-3xl">
            {greeting}, {firstName}
          </h1>
          <p className="mt-2 text-pretty text-[14px] leading-relaxed text-[var(--fg-muted)]">
            Your GATE preparation desk. Review syllabus topics, solve practice papers, or consult your AI tutor.
          </p>
        </motion.div>

        <motion.div variants={riseIn} className="mb-8 grid gap-3 sm:grid-cols-2">
          {/* 1. New AI chat */}
          <button
            onClick={() => startChat()}
            disabled={busy}
            className="group academic-card flex items-start gap-3.5 p-4 text-left cursor-pointer disabled:opacity-60"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]">
              <Bot className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--fg)]">
                New AI chat
                <ArrowRight className="h-3.5 w-3.5 text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--fg-muted)]">
                Private worked-solution tutor streaming explanations.
              </span>
            </span>
          </button>

          {/* 2. Practice Papers */}
          <Link
            href="/app/practice"
            className="group academic-card flex items-start gap-3.5 p-4 text-left cursor-pointer"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--gold-strong)]/30 bg-[var(--gold-subtle)] text-[var(--gold-500)]">
              <BookOpenCheck className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--fg)]">
                Practice Papers
                <ArrowRight className="h-3.5 w-3.5 text-[var(--gold-500)] opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--fg-muted)]">
                MCQ, MSQ & NAT papers with authentic GATE scoring.
              </span>
            </span>
          </Link>

          {/* 3. Study Documents */}
          <Link
            href="/app/documents"
            className="group academic-card flex items-start gap-3.5 p-4 text-left cursor-pointer"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface-raised)] text-[var(--fg-muted)]">
              <FolderOpen className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--fg)]">
                Study Materials
                <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--fg-muted)]">
                Private notes & PDFs — extracted, chunked and searchable.
              </span>
            </span>
          </Link>

          {/* 4. Study Rooms */}
          <div className="academic-card flex items-start gap-3.5 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface-raised)] text-[var(--fg-muted)]">
              <Hash className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="text-[14px] font-semibold text-[var(--fg)]">Study Rooms</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--fg-muted)]">
                Collaborative peer rooms with optional AI tutor moderation.
              </span>
            </span>
          </div>
        </motion.div>

        <motion.div variants={riseIn}>
          <p className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-subtle)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
            Common GATE Study Doubts
          </p>
          <div className="space-y-1.5">
            {PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => startChat(p)}
                disabled={busy}
                className="group academic-card flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] cursor-pointer disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 truncate text-[var(--fg-muted)] group-hover:text-[var(--fg)]">
                  {p}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          variants={riseIn}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-[var(--fg-subtle)]"
        >
          <span className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
            to search everything
          </span>
          <span className="flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Join a study room with an invite code
          </span>
        </motion.div>

        {DEMO_MODE && (
          <motion.div
            variants={riseIn}
            transition={tEnter()}
            className="mt-8 rounded-[var(--r-md)] border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-4 py-3 text-center text-[12.5px] leading-relaxed text-[var(--accent-text)]"
          >
            <strong className="font-semibold">Demo mode.</strong> Data lives in your browser and the
            assistant is simulated locally. Add your Supabase keys to{" "}
            <code className="font-mono">.env.local</code> for the real thing.
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
