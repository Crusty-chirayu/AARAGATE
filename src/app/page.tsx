"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  AtSign,
  BarChart3,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Database,
  FileCheck2,
  FileText,
  KeyRound,
  Layers,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LandingNav } from "@/components/landing/nav";
import { HeroDemo } from "@/components/landing/hero-demo";
import { Reveal, RevealItem, SectionHeading } from "@/components/landing/section";
import { BrandLockup } from "@/components/logo";
import { riseIn, staggerParent, tEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { PLANS as PRICING } from "@/lib/pricing";
import { DEMO_MODE } from "@/lib/env";

const GATE_PILLARS = [
  {
    stage: "01",
    name: "Material Ingestion",
    title: "Ingest Your Authoritative Technical Sources",
    summary:
      "Upload standard textbooks, lecture notes, and question banks. AARAGATE extracts raw text, diagrams, and formulas into chunked semantic records without third-party exposure.",
    icon: FileText,
    tag: "Source Integrity",
  },
  {
    stage: "02",
    name: "Semantic Grounding",
    title: "Exact Page & Passage Citations",
    summary:
      "Every concept explanation and worked solution is strictly tied to verifiable chunks in your uploaded library. No ungrounded hallucinations, no generic hand-waving.",
    icon: Database,
    tag: "Zero Hallucination",
  },
  {
    stage: "03",
    name: "Pattern Recognition",
    title: "Empirical Topic Density & Question Traps",
    summary:
      "Analyze structural patterns across subjects. Identify high-frequency concepts, recurring mathematical motifs, and the dangerous penalty traps of 1-mark vs 2-mark MCQs.",
    icon: Sparkles,
    tag: "Pattern Diagnostics",
  },
  {
    stage: "04",
    name: "Novel Synthesis",
    title: "Grounded Novel Practice Generation",
    summary:
      "Generate novel, mathematically rigorous GATE practice questions matching the exact difficulty of your source documents. Complete with step-by-step verified derivations.",
    icon: Lightbulb,
    tag: "Authentic Practice",
  },
  {
    stage: "05",
    name: "Examination & Mastery",
    title: "Strict Official GATE Scoring & Diagnostics",
    summary:
      "Sit full-length timed papers scored strictly under official GATE rules: 1/3 negative deduction on MCQs, zero penalty on MSQ and NAT. Measure real topic accuracy and net marks.",
    icon: Target,
    tag: "Real Scoring",
  },
];

const FEATURES = [
  {
    icon: Bot,
    title: "A worked-solution tutor for the 2 a.m. doubt",
    body: "A private thread with an assistant built for rigorous problem solving: derive equations step by step, explore counterexamples, or generate five more like it. Answers stream as they're generated; stop and regenerate mid-flight.",
  },
  {
    icon: Database,
    title: "Grounded strictly in your textbooks & notes",
    body: "Upload your technical PDFs. The assistant extracts, chunks, and semantically indexes your material — citing specific pages and passages so you can verify every claim yourself against standard references.",
  },
  {
    icon: CheckCircle2,
    title: "Authentic GATE practice papers with real scoring",
    body: "Practice papers with MCQ, MSQ, and NAT questions. Scored strictly on official GATE marking rules: 1/3 penalty for wrong MCQs, zero for wrong MSQ/NAT, and zero for blank questions. No fake percentiles or ranks.",
  },
  {
    icon: Users,
    title: "Study rooms that hold a batch together",
    body: "Invite by link, roles for owner/admin/member, presence and typing indicators, reactions, and a per-room topic that tells the tutor what your batch is preparing for before it answers.",
  },
  {
    icon: AtSign,
    title: "Controllable AI postures: Off, Mention-only, Auto",
    body: "Study rooms choose their own posture: off for quiet peer revision, mention-only for on-demand dispute resolution when someone writes @ai, or auto for continuous assistance.",
  },
  {
    icon: ShieldCheck,
    title: "Database security & private storage",
    body: "Row Level Security on every table, Edge Function server-side inference where keys never reach the browser, and attachment storage scoped strictly to room membership.",
  },
];

const SCORING_RULES = [
  {
    type: "1-Mark MCQ",
    correct: "+1.00 mark",
    wrong: "-0.33 mark (1/3 deduction)",
    unanswered: "0.00 mark",
    description: "Standard multiple-choice question with exactly one correct option. Negative marking penalizes uncalculated guessing.",
  },
  {
    type: "2-Mark MCQ",
    correct: "+2.00 marks",
    wrong: "-0.67 mark (2/3 deduction)",
    unanswered: "0.00 mark",
    description: "Higher-weight multiple-choice problem. Severe deduction for errors requires high conceptual confidence.",
  },
  {
    type: "MSQ (Multi-Select)",
    correct: "+1.00 or +2.00 marks",
    wrong: "0.00 mark (Zero penalty)",
    unanswered: "0.00 mark",
    description: "One or more options may be correct. Full credit requires identifying all correct choices; zero partial credit.",
  },
  {
    type: "NAT (Numerical Answer)",
    correct: "+1.00 or +2.00 marks",
    wrong: "0.00 mark (Zero penalty)",
    unanswered: "0.00 mark",
    description: "Real number or integer entered via virtual numeric keypad. Zero penalty for mistakes, demanding algebraic precision.",
  },
];

const SECURITY = [
  {
    icon: KeyRound,
    title: "The provider key never reaches a browser",
    body: "All model calls run inside an Edge Function. The client receives a verified stream, never an API credential.",
  },
  {
    icon: Database,
    title: "Row Level Security on every table",
    body: "Membership is the fundamental authorization boundary. Audit tables have RLS enabled with zero policies — unreachable from anon or authenticated roles.",
  },
  {
    icon: Layers,
    title: "Attachments stay scoped to the chat",
    body: "Files live in a private Supabase Storage bucket keyed by conversation. Storage policies verify table membership — never exposing public URLs.",
  },
  {
    icon: ShieldCheck,
    title: "Opt-in training, off by default",
    body: "Your technical documents and conversations are never used for AI training unless explicitly opted in via Settings, revocable at any time.",
  },
];

const ROOM_MESSAGES = [
  {
    id: "m1",
    author: "Priya",
    initial: "P",
    tone: "human" as const,
    text: "GATE 2023 CS, Q32: 32-bit byte-addressed memory, 4-way set-associative cache with 64 B lines and 256 sets. What is the tag size?",
    time: "21:14",
  },
  {
    id: "m2",
    author: "Diego",
    initial: "D",
    tone: "human" as const,
    text: "Line offset is 6 bits (2^6 = 64). Index bits = log2(256) = 8. @ai confirm if tag is 32 - (8 + 6) = 18 bits?",
    time: "21:15",
  },
  {
    id: "m3",
    author: "AARAGATE",
    initial: "AI",
    tone: "ai" as const,
    text: "Confirmed. With 256 sets, the set index requires 8 bits. With 64-byte blocks, word offset is 6 bits. Remaining bits for tag: 32 - (8 + 6) = 18 bits. Total tag directory memory is 256 sets × 4 lines × 18 bits = 18,432 bits.",
    time: "21:15",
  },
  {
    id: "m4",
    author: "Priya",
    initial: "P",
    tone: "human" as const,
    text: "Clear. Marking 18 bits as NAT answer.",
    time: "21:16",
  },
];

export default function LandingPage() {
  const heroRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const demoY = useTransform(scrollYProgress, [0, 1], [0, 48]);
  const demoOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.35]);

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
      <LandingNav />

      {/* Main landmark for WCAG 2.4.1 compliance */}
      <main>
        {/* ---------------- HERO: THE GATE ARCHITECTURE ---------------- */}
        <section ref={heroRef} className="relative overflow-hidden px-5 pb-20 pt-32 sm:pt-40">
          {/* Subtle structural grid background */}
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
            <div
              className="absolute inset-0 opacity-[0.035] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
              }}
            />
          </div>

          <motion.div
            variants={staggerParent(0.06)}
            initial="hidden"
            animate="show"
            className="mx-auto max-w-4xl text-center"
          >
            <motion.div variants={riseIn}>
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-3.5 py-1.5 text-[11.5px] font-semibold tracking-wider uppercase text-[var(--accent-text)]">
                <Sparkles className="h-3.5 w-3.5" />
                The Intelligent Gateway to GATE Preparation
              </span>
            </motion.div>

            <motion.h1
              variants={riseIn}
              className="mt-6 text-balance text-4xl font-semibold leading-[1.12] tracking-tight sm:text-6xl font-serif"
            >
              From Technical Material to
              <br />
              <span className="text-[var(--accent-text)]">
                Rigorous GATE Mastery.
              </span>
            </motion.h1>

            <motion.p
              variants={riseIn}
              className="mx-auto mt-6 max-w-2xl text-pretty text-[16px] leading-relaxed text-[var(--fg-muted)]"
            >
              Ingest standard textbooks and lecture notes, extract verifiable page-level citations,
              practice novel pattern-matched problems with authentic negative marking, and
              diagnose conceptual friction with zero fabricated predictions.
            </motion.p>

            <motion.div
              variants={riseIn}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Button asChild href="/signup" size="lg" className="w-full shadow-[var(--e2)] sm:w-auto">
                <span>Start prepping free</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button asChild href="/app" size="lg" variant="secondary" className="w-full sm:w-auto">
                <span>{DEMO_MODE ? "Explore the Demo" : "Open Workspace"}</span>
              </Button>
            </motion.div>

            <motion.p variants={riseIn} className="mt-4 text-[12px] text-[var(--fg-subtle)]">
              No credit card required · Private document extraction · Official GATE marking scheme · Independent study platform
            </motion.p>
          </motion.div>

          {/* Hero Demo Window */}
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

        {/* ---------------- THE GATE: PROGRESSION ARCHITECTURE ---------------- */}
        <section id="the-gate" className="border-y border-[var(--border)] bg-[var(--surface)] px-5 py-24 sm:py-32">
          <Reveal className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="The Gate Pipeline"
              title="A Structured Progression to Subject Command"
              subtitle="Most preparation fails by collecting hundreds of unread PDFs. The GATE architecture systematically converts raw technical literature into verified examination readiness."
            />

            <div className="mt-16 grid gap-6 md:grid-cols-3 lg:grid-cols-5">
              {GATE_PILLARS.map((pillar) => (
                <RevealItem key={pillar.stage}>
                  <div className="group relative flex h-full flex-col justify-between rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--card-bg)] p-5 transition-all hover:border-[var(--accent-border)] hover:shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[12px] font-bold tracking-wider text-[var(--accent-text)]">
                          {pillar.stage}
                        </span>
                        <Badge tone="neutral" size="sm">
                          {pillar.tag}
                        </Badge>
                      </div>

                      <div className="mt-4 inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-md)] bg-[var(--accent-subtle)] text-[var(--accent-text)]">
                        <pillar.icon className="h-4 w-4" />
                      </div>

                      <h3 className="mt-3 text-[15px] font-semibold text-[var(--fg)]">
                        {pillar.name}
                      </h3>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
                        {pillar.summary}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--border)]">
                      <span className="text-[11px] font-medium text-[var(--fg-subtle)]">
                        {pillar.title}
                      </span>
                    </div>
                  </div>
                </RevealItem>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ---------------- OFFICIAL GATE SCORING & INTEGRITY ---------------- */}
        <section id="scoring" className="px-5 py-24 sm:py-32">
          <Reveal className="mx-auto max-w-5xl">
            <SectionHeading
              eyebrow="Examination Integrity"
              title="Official GATE Marking Rules. No Fake Ranks."
              subtitle="Generic test platforms invent arbitrary scores and fake nationwide percentiles. AARAGATE computes exact marks and deductions under official examination conventions."
            />

            <div className="mt-14 grid gap-4 sm:grid-cols-2">
              {SCORING_RULES.map((rule) => (
                <RevealItem key={rule.type}>
                  <div className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--surface)] p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[15px] font-bold text-[var(--fg)]">{rule.type}</h3>
                      <Badge tone="neutral" size="sm">
                        {rule.correct}
                      </Badge>
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-2 text-[12.5px]">
                      <span className="font-medium text-[var(--danger)]">{rule.wrong}</span>
                      <span className="text-[var(--fg-subtle)]">· Blank: {rule.unanswered}</span>
                    </div>
                    <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
                      {rule.description}
                    </p>
                  </div>
                </RevealItem>
              ))}
            </div>

            <RevealItem>
              <div className="mt-8 rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-center sm:p-5">
                <p className="text-[13px] leading-relaxed text-[var(--fg-muted)]">
                  <strong className="text-[var(--fg)]">Diagnostic Principle:</strong> Wrong MCQs cost you marks directly. Our analytics calculate your exact negative marking friction so you know when to calculate and when to pass.
                </p>
              </div>
            </RevealItem>
          </Reveal>
        </section>

        {/* ---------------- STUDY ROOMS & AI POSTURES ---------------- */}
        <section className="border-t border-[var(--border)] bg-[var(--surface)] px-5 py-24 sm:py-28">
          <Reveal className="mx-auto max-w-5xl">
            <SectionHeading
              eyebrow="Inside a Study Room"
              title="Three aspirants, one doubt, AI on tap"
              subtitle="An authentic study room — header, roles, an @-mention, and a streamed tutor derivation — not a generic mockup."
            />

            <RevealItem>
              <div className="mt-12 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card-bg)] shadow-[var(--e2)]">
                {/* room header */}
                <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--accent-subtle)] text-[var(--accent-text)]">
                      <Users className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-[var(--fg)]">
                        #gate-cs-mock-discussion
                      </p>
                      <p className="text-[12px] text-[var(--fg-subtle)]">
                        3 members · AI: mention-only
                      </p>
                    </div>
                  </div>
                  <div className="flex -space-x-2">
                    {["P", "D", "A"].map((initial) => (
                      <span
                        key={initial}
                        className="inline-grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--card-bg)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--fg-muted)]"
                      >
                        {initial}
                      </span>
                    ))}
                  </div>
                </div>

                {/* messages */}
                <div className="space-y-4 px-5 py-6 sm:px-8 sm:py-7">
                  {ROOM_MESSAGES.map((m) => (
                    <div key={m.id} className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 inline-grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                          m.tone === "ai"
                            ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                            : "bg-[var(--bg-subtle)] text-[var(--fg-muted)] border border-[var(--border)]",
                        )}
                      >
                        {m.tone === "ai" ? <Bot className="h-4 w-4" /> : m.initial}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={cn(
                              "text-[13px] font-semibold",
                              m.tone === "ai" ? "text-[var(--accent-text)]" : "text-[var(--fg)]",
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
                        <p className="mt-1 max-w-2xl text-pretty text-[13.5px] leading-relaxed text-[var(--fg)]">
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

        {/* ---------------- PLATFORM FEATURES ---------------- */}
        <section id="features" className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-24 sm:py-32">
          <Reveal className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="Platform Capabilities"
              title="An Academic Study Desk Built for Rigor"
              subtitle="A 1:1 assistant and a collaborative study-room platform built on one verified infrastructure spine."
            />

            <div className="mt-14">
              {FEATURES.slice(0, 1).map((f) => (
                <RevealItem key={f.title}>
                  <div className="flex flex-col gap-6 border-b border-[var(--border)] pb-10 sm:flex-row sm:items-start sm:gap-10">
                    <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--accent-subtle)] text-[var(--accent-text)]">
                      <f.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 max-w-2xl">
                      <h3 className="text-[18px] font-semibold tracking-tight text-[var(--fg)]">{f.title}</h3>
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
                        i < arr.length - 2 && "border-b border-[var(--border)]",
                      )}
                    >
                      <span className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--card-bg)] text-[var(--fg-muted)] border border-[var(--border)]">
                        <f.icon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--fg)]">{f.title}</h3>
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

        {/* ---------------- SECURITY & ARCHITECTURE ---------------- */}
        <section id="security" className="border-t border-[var(--border)] bg-[var(--surface)] px-5 py-24 sm:py-32">
          <Reveal className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="Security & Privacy"
              title="Rigorous Architecture by Design"
              subtitle="Data isolation, Row Level Security, Edge isolation, and zero unauthorized training."
            />
            <div className="mt-14 grid gap-4 sm:grid-cols-2">
              {SECURITY.map((s) => (
                <RevealItem key={s.title}>
                  <div className="flex h-full gap-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card-bg)] p-6">
                    <span className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--success-subtle)] text-[var(--success)]">
                      <s.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14.5px] font-semibold tracking-tight text-[var(--fg)]">{s.title}</h3>
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
        <section id="pricing" className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-24 sm:py-32">
          <Reveal className="mx-auto max-w-5xl">
            <SectionHeading eyebrow="Transparent Access" title="Priced for Students, Not per Token" />
            <RevealItem>
              <p className="mx-auto mt-4 mb-12 max-w-md text-pretty text-center text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
                Full plan details and tier specifications are detailed on{" "}
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
                        ? "border-[var(--accent)] bg-[var(--card-bg)] shadow-[var(--e3)]"
                        : "border-[var(--border)] bg-[var(--card-bg)]"
                    }`}
                  >
                    {p.highlight && (
                      <span className="absolute -top-2.5 left-6 rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-fg)]">
                        Most popular
                      </span>
                    )}
                    <h3 className="text-[15px] font-semibold text-[var(--fg)]">{p.name}</h3>
                    <p className="mt-1 text-[13px] text-[var(--fg-muted)]">{p.blurb}</p>
                    <p className="mt-5 flex items-baseline gap-1.5">
                      <span className="text-3xl font-semibold tracking-tight text-[var(--fg)]">{p.price}</span>
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

        {/* ---------------- CALL TO ACTION ---------------- */}
        <section className="relative overflow-hidden border-t border-[var(--border)] bg-[var(--surface)] px-5 py-24 sm:py-32">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.14] blur-[110px]"
            style={{ background: "radial-gradient(ellipse 55% 45% at 50% 50%, var(--accent), transparent)" }}
            aria-hidden
          />
          <Reveal className="mx-auto max-w-3xl text-center">
            <RevealItem>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl text-[var(--fg)]">
                Step Through The Gate
              </h2>
            </RevealItem>
            <RevealItem>
              <p className="mx-auto mt-4 max-w-lg text-pretty text-[15px] leading-relaxed text-[var(--fg-muted)]">
                Begin your academic preparation with verified citations and authentic examination practice.
              </p>
            </RevealItem>
            <RevealItem>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild href="/signup" size="lg" className="w-full sm:w-auto">
                  <span>Create Account</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button asChild href="/app" size="lg" variant="secondary" className="w-full sm:w-auto">
                  <span>Open Workspace</span>
                </Button>
              </div>
            </RevealItem>
          </Reveal>
        </section>
      </main>

      {/* ---------------- FOOTER (§28: Strictly Built by Team AARAGATE, no GitHub link) ---------------- */}
      <footer className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <BrandLockup logoClassName="h-6 w-6" wordmarkClassName="text-[13.5px]" />
          </div>

          <div className="text-[13px] font-medium text-[var(--fg-muted)]">
            Built by Team AARAGATE
          </div>

          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--fg-muted)]"
          >
            <a href="#the-gate" className="hover:text-[var(--fg)]">The Gate</a>
            <a href="#scoring" className="hover:text-[var(--fg)]">Scoring</a>
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