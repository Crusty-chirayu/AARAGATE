"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Send } from "lucide-react";
import { Avatar, AiAvatar } from "@/components/ui/avatar";
import { messageIn, tExit } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface Beat {
  kind: "human" | "ai" | "typing";
  name?: string;
  text: string;
  hold: number;
}

const SCRIPT: Beat[] = [
  { kind: "human", name: "Priya", text: "Mock 12, Q47 — my recurrence solves to O(n log n) but the key says O(n).", hold: 1600 },
  { kind: "human", name: "Marcus", text: "I got O(n log n) too. Pretty sure the key is wrong.", hold: 1500 },
  { kind: "human", name: "You", text: "@ai settle it — walk the recursion tree, don't skip levels.", hold: 900 },
  { kind: "typing", text: "", hold: 1100 },
  {
    kind: "ai",
    text: "The key is right. Level work shrinks geometrically — n, then 3n/4, then 9n/16 — so the recursion tree sums to O(n). The n log n slip is treating the n/2 and n/4 branches as equal halves; the smaller branch dies early and stops contributing.",
    hold: 4200,
  },
];

export function HeroDemo() {
  const [visible, setVisible] = React.useState(0);
  const [typed, setTyped] = React.useState("");
  const reduce = React.useRef(false);

  React.useEffect(() => {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  React.useEffect(() => {
    if (reduce.current) {
      setVisible(SCRIPT.length);
      setTyped(SCRIPT[4].text);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const run = async () => {
      while (!cancelled) {
        for (let i = 0; i < SCRIPT.length; i++) {
          if (cancelled) return;
          const beat = SCRIPT[i];
          setVisible(i + 1);

          if (beat.kind === "ai") {
            setTyped("");
            const words = beat.text.split(" ");
            for (let w = 0; w < words.length; w++) {
              if (cancelled) return;
              setTyped((t) => (t ? `${t} ${words[w]}` : words[w]));
              await new Promise((r) => (timer = setTimeout(r, 42)));
            }
          }
          await new Promise((r) => (timer = setTimeout(r, beat.hold)));
        }
        if (cancelled) return;
        setVisible(0);
        setTyped("");
        await new Promise((r) => (timer = setTimeout(r, 700)));
      }
    };
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const shown = SCRIPT.slice(0, visible).filter(
    (b, i) => !(b.kind === "typing" && visible > i + 1),
  );

  return (
    <div className="relative overflow-hidden rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--e4)]">
      {/* window chrome */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-[var(--fg-muted)]">
          <BookOpen className="h-3.5 w-3.5" />
          <span className="truncate">gate-cs-mock-discussion</span>
          <span className="ml-1 rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-text)]">
            AI: mention only
          </span>
        </div>
      </div>

      <div className="flex h-[380px] flex-col gap-4 overflow-hidden p-4 sm:h-[420px] sm:p-5">
        <AnimatePresence initial={false}>
          {shown.map((beat, i) => {
            if (beat.kind === "typing") {
              return (
                <motion.div
                  key="typing"
                  variants={messageIn}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, transition: tExit() }}
                  className="flex items-center gap-3"
                >
                  <AiAvatar size="sm" />
                  <div className="flex items-center gap-1 rounded-[var(--r-lg)] bg-[var(--ai-bubble)] px-3.5 py-3">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--fg-subtle)]"
                        style={{ animationDelay: `${d * 140}ms` }}
                      />
                    ))}
                  </div>
                </motion.div>
              );
            }

            const isAi = beat.kind === "ai";
            const body = isAi ? typed : beat.text;

            return (
              <motion.div
                key={`${i}-${beat.name ?? "ai"}`}
                variants={messageIn}
                initial="hidden"
                animate="show"
                className="flex gap-3"
              >
                {isAi ? <AiAvatar size="sm" /> : <Avatar name={beat.name!} size="sm" />}
                <div className="min-w-0 flex-1">
                  <p className="mb-1 flex items-baseline gap-2 text-[12.5px]">
                    <span className={cn("font-semibold", isAi ? "text-[var(--ai-accent)]" : "text-[var(--fg)]")}>
                      {isAi ? "Assistant" : beat.name}
                    </span>
                    {isAi && (
                      <span className="rounded bg-[var(--accent-subtle)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)]">
                        AI
                      </span>
                    )}
                  </p>
                  <p
                    className={cn(
                      "text-pretty text-[13.5px] leading-relaxed",
                      isAi ? "text-[var(--fg)]" : "text-[var(--fg-muted)]",
                    )}
                  >
                    {body}
                    {isAi && typed.length < SCRIPT[4].text.length && (
                      <span className="stream-caret" />
                    )}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)] p-3">
        <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
          <span className="flex-1 text-[13px] text-[var(--fg-subtle)]">
            Ask the room… use <span className="font-medium text-[var(--accent-text)]">@ai</span> to bring
            in the tutor
          </span>
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] bg-[var(--accent)] text-[var(--accent-fg)]"
          >
            <Send className="h-3.5 w-3.5" />
          </motion.span>
        </div>
      </div>
    </div>
  );
}
