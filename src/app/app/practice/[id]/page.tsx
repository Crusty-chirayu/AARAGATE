"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { QuestionCard } from "@/components/practice/question-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/modal";
import { publicAttempt, unansweredCount, type QuizAttempt } from "@/lib/attempts";
import { getAttempt, submitAttempt } from "@/lib/data/attempts";
import { UNANSWERED, type Response } from "@/lib/quiz";
import { riseIn, staggerParent } from "@/lib/motion";

/**
 * Answering a practice paper.
 *
 * The paper is rendered from `publicAttempt`, so the questions on screen have no
 * answer key in them — the key is only read back from the store after the attempt
 * has been scored, which is what keeps "reveal on submit" a property of the data
 * flow rather than of this component remembering not to render something.
 *
 * Responses are held in a sparse map keyed by question index and are not
 * persisted until submission, so an abandoned paper stays unsubmitted rather
 * than accumulating half-answers on the server.
 */
export default function PracticeSessionPage() {
  const params = useParams();
  const router = useRouter();

  const id = typeof params?.id === "string" ? params.id : "";

  const [attempt, setAttempt] = React.useState<QuizAttempt | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [missing, setMissing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [responses, setResponses] = React.useState<Record<number, Response>>({});
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const loaded = await getAttempt(id);
      if (!loaded) {
        setMissing(true);
        return;
      }
      if (loaded.submitted_at) {
        // Already scored — the review screen is the right place for it.
        router.replace(`/app/attempts/${id}`);
        return;
      }
      setAttempt(loaded);
    } catch (e) {
      setLoadError(`Couldn't open the paper: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

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
        if (loaded.submitted_at) {
          // Already scored — the review screen is the right place for it.
          router.replace(`/app/attempts/${id}`);
          return;
        }
        setAttempt(loaded);
      } catch (e) {
        if (!live) return;
        setLoadError(`Couldn't open the paper: ${String(e)}`);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [id, router]);

  const submit = async () => {
    if (!attempt) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitAttempt(attempt, responses, new Date().toISOString());
      router.replace(`/app/attempts/${attempt.id}`);
    } catch (e) {
      setSubmitError(`Couldn't submit the paper: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const paper = attempt ? publicAttempt(attempt) : null;
  const ordered = paper ? paper.questions.map((_, index) => responses[index] ?? UNANSWERED) : [];
  const skipped = unansweredCount(ordered);


  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-10 text-[13px] text-[var(--fg-muted)] sm:px-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading the paper…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={ArrowLeft}
          title="Couldn't open this paper"
          description={loadError}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Try again
              </Button>
              <Button asChild variant="ghost" href="/app/practice">
                Back to practice
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (missing || !paper) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={ArrowLeft}
          title="That paper isn't here"
          description="It may have been deleted, or it belongs to another browser or account."
          action={
            <Button asChild variant="secondary" href="/app/practice">
              Back to practice
            </Button>
          }
        />
      </div>
    );
  }

  if (paper.questions.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={ArrowLeft}
          title="This paper has no questions"
          description="The paper was built but contains no questions. Try building a new one."
          action={
            <Button asChild variant="secondary" href="/app/practice">
              Back to practice
            </Button>
          }
        />
      </div>
    );
  }

  const total = paper.questions.length;

  return (
    <motion.div
      variants={staggerParent()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6"
    >
      <motion.header variants={riseIn} className="space-y-2">
        <Link
          href="/app/practice"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Practice
        </Link>
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--fg)]">
          {paper.subject}
          {paper.topic ? ` · ${paper.topic}` : ""}
        </h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          {total} question{total === 1 ? "" : "s"} · {paper.difficulty} ·{" "}
          <span className="text-[var(--fg-subtle)]">
            Built-in sample questions, not official GATE questions
          </span>
        </p>
      </motion.header>

      <motion.ol variants={riseIn} className="space-y-3">
        {paper.questions.map((question) => (
          <QuestionCard
            key={question.index}
            question={question}
            response={responses[question.index] ?? UNANSWERED}
            onResponse={(response) =>
              setResponses((prev) => ({ ...prev, [question.index]: response }))
            }
          />
        ))}
      </motion.ol>

      {submitError && (
        <motion.div variants={riseIn}>
          <Alert tone="danger" title="Submission failed" action={<Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>Try again</Button>}>
            {submitError}
          </Alert>
        </motion.div>
      )}

      <motion.div
        variants={riseIn}
        className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-surface-raised)] p-3.5 shadow-[var(--e2)]"
      >
        <p className="text-[12.5px] text-[var(--fg-muted)]" role="status">
          {total - skipped} of {total} answered
          {skipped > 0 ? ` · ${skipped} still blank` : ""}
        </p>
        <Button onClick={() => setConfirmOpen(true)} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit for scoring"}
        </Button>
      </motion.div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setSubmitError(null);
        }}
        onConfirm={submit}
        destructive={false}
        title="Submit this paper?"
        confirmLabel="Submit"
        description={
          skipped > 0
            ? `You have left ${skipped} question${skipped === 1 ? "" : "s"} blank. Blank questions score zero — they are never penalised — but they cannot be answered afterwards. The paper is scored once.`
            : "The paper is scored once and cannot be edited afterwards."
        }
      />
    </motion.div>
  );
}
