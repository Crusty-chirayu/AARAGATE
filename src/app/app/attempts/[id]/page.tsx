"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { QuestionCard, type QuestionReveal } from "@/components/practice/question-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { attemptPercentage, attemptScoreLine, type QuizAttempt } from "@/lib/attempts";
import { getAttempt } from "@/lib/data/attempts";
import { formatMarks, UNANSWERED, type Response } from "@/lib/quiz";
import { riseIn, staggerParent } from "@/lib/motion";

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

  return (
    <motion.div
      variants={staggerParent()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6"
    >
      <motion.header variants={riseIn} className="space-y-2">
        <Link
          href="/app/attempts"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All attempts
        </Link>
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--fg)]">
          {attempt.subject}
          {attempt.topic ? ` · ${attempt.topic}` : ""}
        </h1>
      </motion.header>

      <motion.div variants={riseIn}>
        <Card variant="accent">
          <CardHeader title="Score" description={`${attemptScoreLine(result)} · ${percentage}%`} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ScoreCell label="Awarded" value={`${formatMarks(result.awarded)} / ${result.max}`} />
              <ScoreCell label="Correct" value={String(result.correct)} />
              <ScoreCell label="Wrong" value={String(result.wrong)} />
              <ScoreCell label="Skipped" value={String(result.unanswered)} />
            </dl>
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--fg-subtle)]">
              GATE marking: a wrong MCQ costs one third of its marks; MSQ and NAT carry no negative
              marking; a blank question is always zero, so leaving one unanswered is never worse than
              answering it wrongly.
              {generated > 0 &&
                ` ${generated} of these questions were AI-generated — the explanations are the model's, not an official key.`}
            </p>
          </CardBody>
        </Card>
      </motion.div>

      <motion.ol variants={riseIn} className="space-y-3">
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
function ScoreCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--fg)]">{value}</dd>
    </div>
  );
}
