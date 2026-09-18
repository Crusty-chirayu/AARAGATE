"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AtSign,
  Bot,
  Check,
  Database,
  Gauge,
  KeyRound,
  Layers,
  Mail,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingNav } from "@/components/landing/nav";
import { HeroDemo } from "@/components/landing/hero-demo";
import { Reveal, RevealItem, SectionHeading } from "@/components/landing/section";
import { BrandLockup } from "@/components/logo";
import { riseIn, staggerParent, tEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";
// Shared with the standalone /pricing route so the two cannot drift.
import { PLANS as PRICING } from "@/lib/pricing";
import { DEMO_MODE } from "@/lib/env";

const FEATURES = [
  {
    icon: Bot,
    title: "A tutor for the 2 a.m. doubt",
    body: "A private thread with an assistant that has time for every question — derive it step by step, re-explain it three ways, or generate five more like it. Answers stream as they're generated; stop and regenerate mid-flight.",
  },
  {
    icon: AtSign,
    title: "A tutor with manners",
    body: "Study rooms choose their own posture: off, mention-only, or always-on. In mention-only the tutor waits for @ai, so it settles disagreements instead of hijacking the discussion.",
  },
  {
    icon: Users,
    title: "Study rooms that hold a batch together",
    body: "Invite by link, roles for owner/admin/member, presence and typing indicators, reactions, and a per-room topic that tells the tutor what your batch is preparing for before it answers.",
  },
  {
    icon: ShieldCheck,
    title: "Moderation that fails closed",
    body: "Every message is classified before it reaches the model and again before an answer is published. If the classifier errors, nothing ships. Verdicts are auditable.",
  },
  {
    icon: Gauge,
    title: "Limits you can see",
    body: "Fixed-window rate limits per user, persisted in Postgres: thirty messages a minute, ten AI invocations. No surprise throttling mid-revision.",
  },
  {
    icon: Radio,
    title: "Realtime by default",
    body: "The tutor's reply is one row that updates as it streams, so everyone in the room watches the same derivation appear at the same moment — no refresh, no divergence.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Open a thread or a room",
    body: "A private tutor chat takes one click. A study room takes a name — and optionally a topic that tells the tutor what your batch is preparing for.",
  },
  {
    n: "02",
    title: "Bring your batch in",
    body: "Generate an invite link with an expiry and a use cap. Redemption runs server-side, so nobody joins your room by guessing a UUID.",
  },
  {
    n: "03",
    title: "Set the tutor's posture",
    body: "Off for a distraction-free room. Mention-only when you want it on tap for settling disputes. Auto when it should answer everyone.",
  },
  {
    n: "04",
    title: "Keep the receipts",
    body: "Search every message, pin the room that matters, export your data. History is yours; training on it is opt-in and off by default.",
  },
];

const SECURITY = [
  {
    icon: KeyRound,
    title: "The provider key never reaches a browser",
    body: "All model calls run inside an Edge Function. The client gets a stream, never a credential.",
  },
  {
    icon: Database,
    title: "Row Level Security on every table",
    body: "Membership is the boundary. Audit tables have RLS enabled with zero policies — unreachable from the anon and authenticated roles entirely.",
  },
  {
    icon: Layers,
    title: "Attachments stay scoped to the chat",
    body: "Files live in a private bucket keyed by conversation. Storage policies call the same membership check the tables do — never a public URL.",
  },
  {
    icon: ShieldCheck,
    title: "Opt-in training, off by default",
    body: "Your conversations aren't training data unless you say so, and you can revoke it in Settings at any time.",
  },
];

// Static room fragment used by the product-showcase and AI-participant
// sections. Purely presentational — no product behavior is implied beyond
// what the real room UI does (mentions, roles, streaming AI replies).
const ROOM_MESSAGES = [
  {
    id: "m1",
    author: "Priya",
    initial: "P",
    tone: "human" as const,
    text: "Pushed the new onboarding copy — can someone sanity check the tone before it ships?",
    time: "9:41",
  },
  {
    id: "m2",
    author: "Diego",
    initial: "D",
    tone: "human" as const,
    text: "Reads a little stiff in step 3. @ai what's a warmer way to phrase this line?",
    time: "9:42",
  },
  {
    id: "m3",
    author: "AARAGATE",
    initial: "AI",
    tone: "ai" as const,
    text: "Try: \"You're in — let's get your first room set up.\" Keeps the momentum without over-explaining.",
    time: "9:42",
  },
  {
    id: "m4",
    author: "Priya",
    initial: "P",
    tone: "human" as const,
    text: "That's the one. Shipping it.",
    time: "9:43",
  },
];

// lucide-react no longer ships brand marks (Github, Twitter, etc.), so the
// GitHub glyph in the developer signature is inlined here instead.
function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.42.36.78 1.07.78 2.15 0 1.55-.02 2.8-.02 3.18 0 .31.21.67.8.56A10.53 10.53 0 0 0 23.5 12c0-6.27-5.23-11.5-11.5-11.5Z" />
    </svg>
  );
}

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  // subtle parallax on the hero demo
  const demoY = useTransform(scrollYProgress, [0, 1], [0, 64]);
  const demoOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.35]);

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <LandingNav />

      {/* Every page needs one <main>: it is the landmark a screen-reader
          user jumps to in order to skip the nav (§4 / WCAG 2.4.1). */}
      <main>
      {/* ---------------- HERO ---------------- */}
      <section ref={heroRef} className="relative overflow-hidden px-5 pb-20 pt-32 sm:pt-40">
        {/* atmosphere: faint structural grid + aurora, layered so neither reads as decoration alone */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          <div
            className="absolute inset-0 opacity-[0.05] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
          <div
            className="aurora absolute left-1/2 top-[-18rem] h-[36rem] w-[52rem] -translate-x-1/2 rounded-full opacity-[0.16] blur-[100px]"
            style={{ background: "radial-gradient(circle, var(--accent), transparent 62%)" }}
          />
          <div
            className="aurora absolute right-[-12rem] top-[6rem] h-[30rem] w-[30rem] rounded-full opacity-[0.13] blur-[100px]"
            style={{
              background: "radial-gradient(circle, var(--ai-accent), transparent 62%)",
              animationDelay: "-6s",
            }}
          />
        </div>

        <motion.div
          variants={staggerParent(0.06)}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-3xl text-center"
        >
          <motion.div variants={riseIn}>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--accent-text)]">
              <Sparkles className="h-3.5 w-3.5" />
              v2.0 — group rooms with opt-in AI
            </span>
          </motion.div>

          <motion.h1
            variants={riseIn}
            className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.02em] sm:text-6xl"
          >
            Chat with a tutor who
            <br className="hidden sm:block" />
            {" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-[var(--accent-text)]">knows the syllabus.</span>
              <span
                className="absolute inset-x-0 -bottom-0.5 h-[0.4em] rounded-[3px] bg-[var(--accent-subtle)] sm:-bottom-1"
                aria-hidden
              />
            </span>
          </motion.h1>

          <motion.p
            variants={riseIn}
            className="mx-auto mt-5 max-w-xl text-pretty text-[16.5px] leading-relaxed text-[var(--fg-muted)]"
          >
            AARAGATE is your gateway through the GATE syllabus: a private AI tutor for the
            2&nbsp;a.m. doubt, and study rooms where your batch argues, resolves, and moves on —
            one conversation model, streaming end to end, moderated at both edges.
          </motion.p>

          <motion.div
            variants={riseIn}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button asChild href="/signup" size="lg" className="w-full shadow-[var(--e2)] sm:w-auto">
              Start prepping free
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button asChild href="/app" size="lg" variant="secondary" className="w-full sm:w-auto">
              {DEMO_MODE ? "Explore the demo" : "Open the app"}
            </Button>
          </motion.div>

          <motion.p variants={riseIn} className="mt-4 text-[12.5px] text-[var(--fg-subtle)]">
            No credit card. Your history is yours — training is opt-in. Not affiliated with GATE or
            any organising institute.
          </motion.p>
        </motion.div>

        <motion.div
          style={{ y: demoY, opacity: demoOpacity }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...tEnter(0.48), delay: 0.24 }}
          className="mx-auto mt-16 max-w-3xl"
        >
          <HeroDemo />
        </motion.div>
      </section>

      {/* ---------------- PHILOSOPHY / BIG STATEMENT ---------------- */}
      <section className="border-y border-[var(--border)] px-5 py-20 sm:py-28">
        <Reveal className="mx-auto max-w-4xl text-center">
          <RevealItem>
            <span className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
              The idea
            </span>
          </RevealItem>
          <RevealItem>
            <p className="mt-5 text-balance text-2xl font-medium leading-snug tracking-[-0.01em] text-[var(--fg)] sm:text-[32px]">
              GATE isn&apos;t cleared by collecting PDFs. AARAGATE starts from the doubt itself —
              <span className="text-[var(--fg-muted)]">
                {" "}
                a tutor that answers until it&apos;s actually understood, and a room where your batch&apos;s
                arguments become everyone&apos;s revision notes.
              </span>
            </p>
          </RevealItem>
        </Reveal>
      </section>

      {/* ---------------- PRODUCT SHOWCASE ---------------- */}
      <section className="relative overflow-hidden px-5 py-24 sm:py-32">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.1] blur-[110px]"
          style={{ background: "radial-gradient(ellipse 60% 40% at 50% 20%, var(--ai-accent), transparent)" }}
          aria-hidden
        />
        <Reveal className="mx-auto max-w-5xl">
          <SectionHeading
            eyebrow="Inside a study room"
            title="Three aspirants, one doubt, AI on tap"
            subtitle="This is a real room's shape — header, roles, an @-mention, and a streamed tutor reply — not a mockup of a different product."
          />

          <RevealItem>
            <div className="mt-14 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--e3)]">
              {/* room header */}
              <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--accent-subtle)] text-[var(--accent-text)]">
                    <Users className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">#gate-cs-mock-discussion</p>
                    <p className="text-[12px] text-[var(--fg-subtle)]">3 members · AI: mention-only</p>
                  </div>
                </div>
                <div className="flex -space-x-2">
                  {["P", "D", "A"].map((initial) => (
                    <span
                      key={initial}
                      className="inline-grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--fg-muted)]"
                    >
                      {initial}
                    </span>
                  ))}
                </div>
              </div>

              {/* messages */}
              <div className="space-y-5 px-5 py-6 sm:px-8 sm:py-8">
                {ROOM_MESSAGES.map((m) => (
                  <div key={m.id} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 inline-grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                        m.tone === "ai"
                          ? "bg-[var(--ai-accent)] text-white"
                          : "bg-[var(--bg-subtle)] text-[var(--fg-muted)]",
                      )}
                    >
                      {m.tone === "ai" ? <Bot className="h-4 w-4" /> : m.initial}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "text-[13px] font-semibold",
                            m.tone === "ai" && "text-[var(--ai-accent)]",
                          )}
                        >
                          {m.author}
                        </span>
                        {m.tone === "ai" && (
                          <span className="rounded-full bg-[var(--accent-subtle)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent-text)]">
                            AI
                          </span>
                        )}
                        <span className="text-[11px] text-[var(--fg-subtle)]">{m.time}</span>
                      </div>
                      <p className="mt-1 max-w-lg text-pretty text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
                        {m.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </RevealItem>
        </Reveal>
      </section>

      {/* ---------------- GROUP CONVERSATION EXPERIENCE ---------------- */}
      <section className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-24 sm:py-32">
        <Reveal className="mx-auto max-w-5xl">
          <div className="grid gap-10 sm:grid-cols-[1fr_1.1fr] sm:items-center sm:gap-16">
            <RevealItem>
              <span className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                Study rooms
              </span>
              <h3 className="mt-4 text-balance text-2xl font-semibold tracking-tight sm:text-[28px]">
                Everyone in the room shares one thread — not a separate copy each
              </h3>
              <p className="mt-4 text-pretty text-[14.5px] leading-relaxed text-[var(--fg-muted)]">
                Owners set the room up, admins manage who&apos;s in it, members just study. Presence and
                typing indicators make it feel like a library table; reactions and a per-room topic
                keep it on-track — including for the tutor, which reads that topic before it answers,
                so it knows this room is revising GATE CS, not making small talk.
              </p>
            </RevealItem>
            <RevealItem>
              <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--e2)]">
                <div className="flex items-center justify-between text-[11.5px] text-[var(--fg-subtle)]">
                  <span>Members</span>
                  <span>Role</span>
                </div>
                <div className="mt-3 divide-y divide-[var(--border)]">
                  {[
                    { name: "Priya", role: "Owner" },
                    { name: "Diego", role: "Admin" },
                    { name: "Amara", role: "Member" },
                  ].map((p) => (
                    <div key={p.name} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--fg-muted)]">
                          {p.name[0]}
                        </span>
                        <span className="text-[13px] font-medium">{p.name}</span>
                      </div>
                      <span className="text-[11.5px] text-[var(--fg-subtle)]">{p.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </RevealItem>
          </div>
        </Reveal>
      </section>

      {/* ---------------- AI PARTICIPANT EXPERIENCE ---------------- */}
      <section className="px-5 py-24 sm:py-32">
        <Reveal className="mx-auto max-w-5xl">
          <div className="grid gap-10 sm:grid-cols-[1.1fr_1fr] sm:items-center sm:gap-16">
            <RevealItem>
              <div className="order-2 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--e2)] sm:order-1">
                <div className="flex items-center gap-2 text-[11.5px] text-[var(--fg-subtle)]">
                  <AtSign className="h-3.5 w-3.5" />
                  Posture: mention-only
                </div>
                <div className="mt-3 space-y-2.5">
                  <div className="rounded-[var(--r-md)] bg-[var(--bg-subtle)] px-3 py-2 text-[13px] text-[var(--fg-muted)]">
                    Off — a human-only room, the tutor never reads it.
                  </div>
                  <div className="rounded-[var(--r-md)] border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-3 py-2 text-[13px] text-[var(--accent-text)]">
                    Mention-only — it answers when someone writes @ai.
                  </div>
                  <div className="rounded-[var(--r-md)] bg-[var(--bg-subtle)] px-3 py-2 text-[13px] text-[var(--fg-muted)]">
                    Auto — a full participant, replying without a mention.
                  </div>
                </div>
              </div>
            </RevealItem>
            <RevealItem>
              <div className="order-1 sm:order-2">
                <span className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                  AI, invited
                </span>
                <h3 className="mt-4 text-balance text-2xl font-semibold tracking-tight sm:text-[28px]">
                  It reads the room before it answers — not just the message
                </h3>
                <p className="mt-4 text-pretty text-[14.5px] leading-relaxed text-[var(--fg-muted)]">
                  When it&apos;s brought in, the assistant sees the same thread everyone else does: the
                  topic, the recent back-and-forth, who&apos;s asking. Its reply streams into the room as one
                  message that updates live, so nobody is watching a private answer arrive somewhere
                  else.
                </p>
              </div>
            </RevealItem>
          </div>
        </Reveal>
      </section>

      {/* ---------------- FEATURES ---------------- */}
      {/* Editorial rows rather than a card grid: the first feature leads at
          full width, the rest fall into a two-column list separated by
          hairlines so hierarchy comes from layout, not from six identical
          boxes. */}
      <section className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-24 sm:py-32">
        <Reveal id="features" className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="What you get"
            title="A private tutor and a shared room, one spine"
            subtitle="A 1:1 assistant and a study-room platform built on one conversation model — so a late-night thread and a twelve-person batch room behave identically where it counts."
          />

          <div className="mt-14">
            {FEATURES.slice(0, 1).map((f) => (
              <RevealItem key={f.title}>
                <div className="flex flex-col gap-6 border-b border-[var(--border)] pb-10 sm:flex-row sm:items-start sm:gap-10">
                  <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--accent-subtle)] text-[var(--accent-text)]">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 max-w-2xl">
                    <h3 className="text-[18px] font-semibold tracking-tight">{f.title}</h3>
                    <p className="mt-2.5 text-pretty text-[15px] leading-relaxed text-[var(--fg-muted)]">
                      {f.body}
                    </p>
                  </div>
                </div>
              </RevealItem>
            ))}

            <div className="grid gap-x-10 sm:grid-cols-2">
              {FEATURES.slice(1).map((f, i, arr) => (
                <RevealItem key={f.title}>
                  <div
                    className={cn(
                      "flex gap-4 py-8",
                      // hairline under every row except the last one in each column
                      i < arr.length - 2 && "border-b border-[var(--border)]",
                    )}
                  >
                    <span className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--surface)] text-[var(--fg-muted)]">
                      <f.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold tracking-tight">{f.title}</h3>
                      <p className="mt-2 text-pretty text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
                        {f.body}
                      </p>
                    </div>
                  </div>
                </RevealItem>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------------- HOW ---------------- */}
      <section className="px-5 py-24 sm:py-32">
        <Reveal id="how" className="mx-auto max-w-5xl">
          <SectionHeading
            eyebrow="How it works"
            title="Four steps, no setup ceremony"
          />
          <div className="relative mt-14">
            <div
              className="absolute left-[13px] top-2 hidden h-[calc(100%-2rem)] w-px bg-[var(--border)] sm:block"
              aria-hidden
            />
            <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {STEPS.map((s) => (
                <RevealItem key={s.n}>
                  <div className="flex gap-5">
                    <span className="relative z-10 inline-grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--bg-subtle)] font-mono text-[12px] font-semibold tabular-nums text-[var(--accent-text)] ring-4 ring-[var(--bg)]">
                      {s.n.replace("0", "")}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold tracking-tight">{s.title}</h3>
                      <p className="mt-2 text-pretty text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
                        {s.body}
                      </p>
                    </div>
                  </div>
                </RevealItem>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------------- SECURITY ---------------- */}
      <section className="border-y border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-24 sm:py-32">
        <Reveal id="security" className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Security"
            title="The boring parts, done properly"
            subtitle="Membership is the only authorization primitive, and it's enforced in the database rather than in application code that someone will eventually forget to call."
          />
          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {SECURITY.map((s) => (
              <RevealItem key={s.title}>
                <div className="flex h-full gap-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
                  <span className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--success-subtle)] text-[var(--success)]">
                    <s.icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[14.5px] font-semibold tracking-tight">{s.title}</h3>
                    <p className="mt-1.5 text-pretty text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
                      {s.body}
                    </p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------------- PRICING ---------------- */}
      <section className="px-5 py-24 sm:py-32">
        <Reveal id="pricing" className="mx-auto max-w-5xl">
          <SectionHeading eyebrow="Pricing" title="Priced per person, not per token" />
          <RevealItem>
            <p className="mx-auto mt-4 mb-12 max-w-md text-pretty text-center text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
              Full plan details, limits and the awkward questions live on{" "}
              <Link
                href="/pricing"
                className="font-medium text-[var(--accent-text)] hover:underline"
              >
                the pricing page
              </Link>
              .
            </p>
          </RevealItem>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {PRICING.map((p) => (
              <RevealItem key={p.name}>
                <div
                  className={`relative flex h-full flex-col rounded-[var(--r-lg)] border p-6 ${
                    p.highlight
                      ? "border-[var(--accent)] bg-[var(--surface)] shadow-[var(--e3)]"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  {p.highlight && (
                    <span className="absolute -top-2.5 left-6 rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-fg)]">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-[15px] font-semibold">{p.name}</h3>
                  <p className="mt-1 text-[13px] text-[var(--fg-muted)]">{p.blurb}</p>
                  <p className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-3xl font-semibold tracking-tight">{p.price}</span>
                    <span className="text-[12.5px] text-[var(--fg-subtle)]">{p.cadence}</span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-[13.5px] text-[var(--fg-muted)]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    href="/signup"
                    variant={p.highlight ? "primary" : "secondary"}
                    className="mt-7 w-full"
                  >
                    {p.cta}
                  </Button>
                </div>
              </RevealItem>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="relative overflow-hidden border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-24 sm:py-32">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.14] blur-[110px]"
          style={{ background: "radial-gradient(ellipse 55% 45% at 50% 50%, var(--accent), transparent)" }}
          aria-hidden
        />
        <Reveal className="mx-auto max-w-3xl text-center">
          <RevealItem>
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Open the gateway
            </h2>
          </RevealItem>
          <RevealItem>
            <p className="mx-auto mt-4 max-w-lg text-pretty text-[15px] leading-relaxed text-[var(--fg-muted)]">
              Free to start, and the demo runs without an account.
            </p>
          </RevealItem>
          <RevealItem>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild href="/signup" size="lg" className="w-full sm:w-auto">
                Create your account
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button asChild href="/app" size="lg" variant="secondary" className="w-full sm:w-auto">
                Open the app
              </Button>
            </div>
          </RevealItem>
        </Reveal>
      </section>

      {/* ---------------- DEVELOPER SIGNATURE ---------------- */}
      <section className="px-5 py-20 sm:py-24">
        <Reveal className="mx-auto max-w-3xl">
          <RevealItem>
            <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] px-6 py-8 text-center shadow-[var(--e2)] sm:px-10 sm:py-10">
              <span className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                Built by
              </span>
              <h3 className="mt-3 text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                Chirayu Babu Jaysawal
              </h3>
              <p className="mt-1.5 text-[13.5px] text-[var(--fg-muted)]">Crusty-chirayu (Chirayu)</p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="https://github.com/Crusty-chirayu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--fg)] transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  <GithubMark className="h-4 w-4" />
                  GitHub
                  <ArrowUpRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </a>
                <a
                  href="mailto:chirayujayaswal7@gmail.com"
                  className="inline-flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--fg)] transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  <Mail className="h-4 w-4" />
                  Email
                </a>
              </div>
            </div>
          </RevealItem>
        </Reveal>
      </section>

      </main>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="border-t border-[var(--border)] px-5 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <BrandLockup logoClassName="h-6 w-6" wordmarkClassName="text-[13.5px]" />
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--fg-muted)]"
          >
            <a href="#features" className="hover:text-[var(--fg)]">Features</a>
            <a href="#security" className="hover:text-[var(--fg)]">Security</a>
            <Link href="/pricing" className="hover:text-[var(--fg)]">Pricing</Link>
            <Link href="/changelog" className="hover:text-[var(--fg)]">Changelog</Link>
            <Link href="/login" className="hover:text-[var(--fg)]">Sign in</Link>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-[12px] leading-relaxed text-[var(--fg-subtle)]">
          AARAGATE is an independent study tool. It is not affiliated with, endorsed by, or
          connected to GATE or any of its organising institutes. AI answers can be wrong — verify
          anything exam-critical against the official syllabus and standard references.
        </p>
      </footer>
    </div>
  );
}