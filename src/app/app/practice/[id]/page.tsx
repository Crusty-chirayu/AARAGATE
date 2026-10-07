"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Clock, LayoutGrid, Loader2, RefreshCw } from "lucide-react";
import { QuestionCard } from "@/components/practice/question-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/modal";
import {
  publicAttempt,
  restoreAttemptResponses,
  unansweredCount,
  type QuizAttempt,
} from "@/lib/attempts";
import { getAttempt, submitAttempt } from "@/lib/data/attempts";
import { UNANSWERED, type Response } from "@/lib/quiz";
import { riseIn, staggerParent } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Examination clock displaying elapsed time since paper generation.
 */
function ExamTimer({ startTime }: { startTime: string }) {
  const [seconds, setSeconds] = React.useState(0);

  React.useEffect(() => {
    const startMs = new Date(startTime).getTime();
    const update = () => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setSeconds(elapsedSec);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const formatted =
    hrs > 0
      ? `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-[12px] font-mono font-medium tabular-nums text-[var(--fg)] shadow-xs"
      role="timer"
      aria-label={`Elapsed examination time: ${formatted}`}
    >
      <Clock className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden />
      <span>{formatted}</span>
    </div>
  );
}

/**
 * Answering a practice paper.
 *
 * The paper is rendered from `publicAttempt`, so the questions on screen have no
 * answer key in them — the key is only read back from the store after the attempt
 * has been scored, which is what keeps "reveal on submit" a property of the data
 * flow rather than of this component remembering not to render something.
 *
 * Responses stay local to this browser until submission; the server still
 * scores only the submitted response set against its private snapshot.
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
  const [restoreError, setRestoreError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const responsesRef = React.useRef<Record<number, Response>>({});
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const restoreResponses = React.useCallback((loaded: QuizAttempt) => {
    const key = `aaragate:practice-responses:${loaded.id}`;
    try {
      const restored = restoreAttemptResponses(
        window.localStorage.getItem(key),
        publicAttempt(loaded).questions,
      );
      responsesRef.current = restored;
      setResponses(restored);
      setRestoreError(null);
    } catch {
      responsesRef.current = {};
      setResponses({});
      setRestoreError("Saved answers could not be restored; this paper starts unanswered.");
      try {
        window.localStorage.removeItem(key);
      } catch {
        setSaveError("Browser storage is unavailable; answers will not survive leaving this page.");
      }
    }
  }, []);

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
      restoreResponses(loaded);
      setAttempt(loaded);
    } catch (e) {
      setLoadError(`Couldn't open the paper: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [id, restoreResponses, router]);

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
        restoreResponses(loaded);
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
  }, [id, restoreResponses, router]);

  const updateResponse = (index: number, response: Response) => {
    const next = { ...responsesRef.current };
    if (response.kind === "unanswered") delete next[index];
    else next[index] = response;
    responsesRef.current = next;
    setResponses(next);

    if (!attempt) return;
    try {
      const key = `aaragate:practice-responses:${attempt.id}`;
      if (Object.keys(next).length === 0) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(next));
      setSaveError(null);
    } catch {
      setSaveError("Browser storage is unavailable; answers will not survive leaving this page.");
    }
  };

  const submit = async () => {
    if (!attempt) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitAttempt(attempt, responses, new Date().toISOString());
      try {
        window.localStorage.removeItem(`aaragate:practice-responses:${attempt.id}`);
      } catch (e) {
        console.warn("Could not clear saved practice responses after submission.", e);
      }
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

  const isQuestionAnswered = (idx: number) => {
    const r = responses[idx];
    if (!r) return false;
    if (r.kind === "unanswered") return false;
    if (r.kind === "options") return r.selected.length > 0;
    if (r.kind === "numeric") return r.value !== null && Number.isFinite(r.value);
    return false;
  };

  const scrollToQuestion = (idx: number) => {
    const el = document.getElementById(`question-${idx + 1}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

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
  const answeredCountNum = total - skipped;

  return (
    <motion.div
      variants={staggerParent()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-16 sm:px-6"
    >
      <motion.header variants={riseIn} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/app/practice"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Practice
          </Link>
          {attempt && <ExamTimer startTime={attempt.created_at} />}
        </div>

        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--fg)]">
            {paper.subject}
            {paper.topic ? ` · ${paper.topic}` : ""}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--fg-muted)]">
            <span className="font-medium text-[var(--fg)]">{total} Questions</span>
            <span>·</span>
            <span className="capitalize">{paper.difficulty} Level</span>
            <span>·</span>
            <span className="text-[var(--fg-subtle)]">GATE Marking Rules Apply</span>
          </div>
        </div>

        {/* Question Palette */}
        <section
          aria-label="Question Palette"
          className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-xs"
        >
          <div className="mb-2.5 flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
            <span className="flex items-center gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden />
              Question Palette
            </span>
            <span className="font-normal normal-case text-[var(--fg-muted)]">
              <strong className="font-semibold text-[var(--fg)]">{answeredCountNum}</strong> answered ·{" "}
              <strong className="font-semibold text-[var(--fg)]">{skipped}</strong> blank
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5" role="navigation" aria-label="Questions list">
            {paper.questions.map((q, idx) => {
              const answered = isQuestionAnswered(idx);
              return (
                <button
                  key={q.index}
                  type="button"
                  onClick={() => scrollToQuestion(idx)}
                  aria-label={`Question ${idx + 1}, ${answered ? "answered" : "not answered"}`}
                  className={cn(
                    "flex h-8 min-w-[34px] items-center justify-center gap-1 rounded-[var(--r-md)] border px-2 text-[12px] font-medium transition-all duration-[var(--d-micro)]",
                    answered
                      ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)] shadow-xs"
                      : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--fg-muted)] hover:border-[var(--border-strong)] hover:text-[var(--fg)]",
                  )}
                >
                  <span>Q{idx + 1}</span>
                  {answered && <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Marking rules banner */}
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--fg-subtle)]">
          <strong className="font-medium text-[var(--fg-muted)]">Marking scheme:</strong> MCQ carrying 1/3 negative marks for incorrect answers. MSQ & NAT carry no negative marking. Blank questions score zero without penalty.
        </div>
        <p className="text-[12px] text-[var(--fg-subtle)]">
          Your answers are saved in this browser until you submit the paper.
        </p>
      </motion.header>

      {restoreError && (
        <Alert tone="warning" title="Saved answers could not be restored">
          {restoreError}
        </Alert>
      )}
      {saveError && (
        <Alert tone="warning" title="Answers are not being saved">
          {saveError}
        </Alert>
      )}

      <motion.ol variants={riseIn} className="space-y-4">
        {paper.questions.map((question) => (
          <QuestionCard
            key={question.index}
            question={question}
            response={responses[question.index] ?? UNANSWERED}
            onResponse={(response) => updateResponse(question.index, response)}
          />
        ))}
      </motion.ol>

      {submitError && (
        <motion.div variants={riseIn}>
          <Alert
            tone="danger"
            title="Submission failed"
            action={
              <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>
                Try again
              </Button>
            }
          >
            {submitError}
          </Alert>
        </motion.div>
      )}

      <motion.div
        variants={riseIn}
        className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-surface-raised)] p-4 shadow-[var(--e2)]"
      >
        <p className="text-[13px] text-[var(--fg-muted)]" role="status">
          <span className="font-semibold text-[var(--fg)]">{answeredCountNum}</span> of{" "}
          <span className="font-semibold text-[var(--fg)]">{total}</span> answered
          {skipped > 0 ? ` · ${skipped} still blank` : " · All answered"}
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
