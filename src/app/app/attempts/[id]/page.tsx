"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, LayoutGrid, Loader2, MinusCircle, XCircle } from "lucide-react";
import { QuestionCard, type QuestionReveal } from "@/components/practice/question-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { attemptPercentage, attemptScoreLine, type QuizAttempt } from "@/lib/attempts";
import { getAttempt } from "@/lib/data/attempts";
import { formatMarks, UNANSWERED, type Response } from "@/lib/quiz";
import { riseIn, staggerParent } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Review of a submitted paper.
 *
 * This is the only screen that renders a question's key, and it does so from the
 * data the store returned *after* scoring — never from anything the browser held
 * while the paper was being answered.
 *
 * The summary is deliberately explicit about the three outcomes rather than
 * showing one "score": on a negatively-marked paper, 20/50 from 5 correct and 5
 * wrong is a different situation from 20/50 from 8 correct and 5 blank, and the
 * screen should not hide that behind a single number.
 */
export default function AttemptReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";

  const [attempt, setAttempt] = React.useState<QuizAttempt | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const loaded = await getAttempt(id);
        if (!live) return;
        if (!loaded) {
          setMissing(true);
          return;
        }
        if (!loaded.submitted_at || !loaded.result) {
          // Still being answered — send the student back to it rather than
          // showing a review of a paper that has no score.
          router.replace(`/app/practice/${id}`);
          return;
        }
        setAttempt(loaded);
      } catch {
        if (live) setMissing(true);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [id, router]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-10 text-[13px] text-[var(--fg-muted)] sm:px-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading the review…
      </div>
    );
  }

  if (missing || !attempt || !attempt.result) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={ArrowLeft}
          title="That attempt isn't here"
          description="It may have been deleted, or it belongs to another browser or account."
          action={
            <Button asChild variant="secondary" href="/app/attempts">
              Back to attempts
            </Button>
          }
        />
      </div>
    );
  }

  const result = attempt.result;
  const percentage = attemptPercentage(result);
  const verdictFor = (index: number): QuestionReveal => {
    const question = attempt.questions[index];
    return {
      verdict: attempt.verdicts?.[index] ?? {
        outcome: "unanswered",
        awarded: 0,
        max: question.marks,
      },
      answer: question.answer,
      natRange: question.nat_range,
      explanation: question.explanation,
    };
  };
  const responseFor = (index: number): Response => attempt.responses?.[index] ?? UNANSWERED;
  const generated = attempt.questions.filter(
    (question) => question.provenance === "ai_generated",
  ).length;

  const scrollToQuestion = (idx: number) => {
    const el = document.getElementById(`question-${idx + 1}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <motion.div
      variants={staggerParent()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-16 sm:px-6"
    >
      <motion.header variants={riseIn} className="space-y-2">
        <Link
          href="/app/attempts"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All attempts
        </Link>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--fg)]">
          {attempt.subject}
          {attempt.topic ? ` · ${attempt.topic}` : ""}
        </h1>
        <p className="text-[12.5px] text-[var(--fg-muted)]">
          Submitted paper review and worked solutions · {attempt.questions.length} questions
        </p>
      </motion.header>

      {/* Score Summary Card */}
      <motion.div variants={riseIn}>
        <Card variant="accent" className="border-[var(--border)] shadow-sm">
          <CardHeader
            title="Official Score Report"
            description={`${attemptScoreLine(result)} · ${percentage}% achieved`}
          />
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ScoreCell
                label="Marks Awarded"
                value={`${formatMarks(result.awarded)} / ${result.max}`}
                highlight
              />
              <ScoreCell
                label="Correct Answers"
                value={String(result.correct)}
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden />}
              />
              <ScoreCell
                label="Incorrect / Penalised"
                value={String(result.wrong)}
                icon={<XCircle className="h-3.5 w-3.5 text-[var(--danger)]" aria-hidden />}
              />
              <ScoreCell
                label="Blank / Skipped"
                value={String(result.unanswered)}
                icon={<MinusCircle className="h-3.5 w-3.5 text-[var(--fg-subtle)]" aria-hidden />}
              />
            </dl>

            {/* Question Review Palette */}
            <div className="border-t border-[var(--border)] pt-3.5">
              <div className="mb-2 flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                <span className="flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden />
                  Question Review Navigator
                </span>
                <span className="font-normal normal-case text-[var(--fg-muted)]">
                  Click to jump to key & solution
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {attempt.questions.map((_, idx) => {
                  const verdict = verdictFor(idx).verdict;
                  const outcome = verdict.outcome;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => scrollToQuestion(idx)}
                      aria-label={`Question ${idx + 1}, ${outcome}`}
                      className={cn(
                        "flex h-8 min-w-[34px] items-center justify-center gap-1 rounded-[var(--r-md)] border px-2 text-[12px] font-medium transition-all duration-[var(--d-micro)]",
                        outcome === "correct" &&
                          "border-[var(--success)]/40 bg-[var(--success-subtle)] text-[var(--success)]",
                        outcome === "wrong" &&
                          "border-[var(--danger)]/40 bg-[var(--danger-subtle)] text-[var(--danger)]",
                        outcome === "unanswered" &&
                          "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      <span>Q{idx + 1}</span>
                      {outcome === "correct" && (
                        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
                      )}
                      {outcome === "wrong" && (
                        <XCircle className="h-3 w-3 shrink-0" aria-hidden />
                      )}
                      {outcome === "unanswered" && (
                        <MinusCircle className="h-3 w-3 shrink-0" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="border-t border-[var(--border)] pt-3 text-[11.5px] leading-relaxed text-[var(--fg-subtle)]">
              GATE marking rules: wrong MCQs incur a 1/3 marks penalty; MSQ and NAT carry no negative marking; blank questions score zero without penalty.
              {generated > 0 &&
                ` ${generated} of these questions were AI-generated — explanations are generated from technical course material.`}
            </p>
          </CardBody>
        </Card>
      </motion.div>

      <motion.ol variants={riseIn} className="space-y-4">
        {attempt.questions.map((question) => (
          <QuestionCard
            key={question.index}
            question={question}
            response={responseFor(question.index)}
            onResponse={() => {
              /* a submitted paper is read-only */
            }}
            reveal={verdictFor(question.index)}
            disabled
          />
        ))}
      </motion.ol>
    </motion.div>
  );
}

/** One figure in the score summary. */
function ScoreCell({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-md)] border border-[var(--border)] p-2.5",
        highlight ? "bg-[var(--accent-subtle)]/40" : "bg-[var(--surface)]",
      )}
    >
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
        {icon}
        <span className="truncate">{label}</span>
      </dt>
      <dd
        className={cn(
          "mt-1 text-[16px] font-semibold tabular-nums",
          highlight ? "text-[var(--accent-text)]" : "text-[var(--fg)]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
