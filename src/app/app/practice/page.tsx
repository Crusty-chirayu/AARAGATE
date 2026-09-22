"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BookOpenCheck, History } from "lucide-react";
import { PracticeConfigForm } from "@/components/practice/practice-config";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  attemptScoreLine,
  type AttemptQuestion,
  type QuizAttempt,
} from "@/lib/attempts";
import { createAttempt, listAttempts, newAttemptId, type AttemptSummary } from "@/lib/data/attempts";
import { generatePaper, generationErrorInfo } from "@/lib/data/generation";
import { listDocuments } from "@/lib/data/documents";
import { samplePaper, shortfallNote } from "@/lib/data/practice";
import { DEMO_MODE } from "@/lib/env";
import { riseIn, staggerParent } from "@/lib/motion";
import type { PracticeConfig } from "@/lib/practice";

/**
 * Practice setup.
 *
 * In demo mode a paper is assembled from the built-in sample bank and stored as
 * a real attempt before the student is taken to it — so a reload mid-paper does
 * not lose the questions, and the history screen shows the paper even if it is
 * never submitted.
 *
 * In Supabase mode the paper comes from the `practice-generator` Edge Function
 * through `generatePaper`. Failures there are explicit: nothing is stored, the
 * error is surfaced with a retry, and sample questions are never substituted
 * for generated ones.
 */
export default function PracticePage() {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = React.useState(false);
  const [recent, setRecent] = React.useState<AttemptSummary[]>([]);
  const [documents, setDocuments] = React.useState<Array<{ id: string; filename: string }>>([]);
  const [documentsError, setDocumentsError] = React.useState<string | null>(null);
  const [generationError, setGenerationError] = React.useState<{ title: string; description: string; config?: PracticeConfig } | null>(null);
  const [lastConfig, setLastConfig] = React.useState<PracticeConfig | null>(null);

  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const attempts = await listAttempts();
        if (live) setRecent(attempts.slice(0, 3));
      } catch {
        /* history is a convenience here; the form must still work without it */
      }
      if (!DEMO_MODE) {
        try {
          const docs = await listDocuments();
          if (live) {
            setDocuments(
              docs
                .filter((doc) => doc.status === "ready")
                .map((doc) => ({ id: doc.id, filename: doc.filename })),
            );
          }
          setDocumentsError(null);
        } catch {
          if (live) {
            setDocumentsError("Could not load your documents. Check your connection and try again.");
          }
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const retryDocuments = () => {
    setDocumentsError(null);
    void (async () => {
      try {
        const docs = await listDocuments();
        setDocuments(
          docs
            .filter((doc) => doc.status === "ready")
            .map((doc) => ({ id: doc.id, filename: doc.filename })),
        );
      } catch {
        setDocumentsError("Could not load your documents. Check your connection and try again.");
      }
    })();
  };

  const start = async (config: PracticeConfig) => {
    setBusy(true);
    setGenerationError(null);
    setLastConfig(config);
    try {
      let questions: AttemptQuestion[];
      let shortfallToast: { title: string; description: string } | null = null;

      if (DEMO_MODE) {
        const paper = samplePaper(config);
        if (paper.questions.length === 0) {
          setGenerationError({
            title: "Nothing to practise on",
            description:
              shortfallNote(paper.shortfall) ??
              "The built-in sample bank has no questions for that subject, topic and difficulty.",
            config,
          });
          return;
        }
        questions = paper.questions;
        const note = shortfallNote(paper.shortfall);
        if (note) {
          shortfallToast = {
            title: "The paper is shorter than you asked for",
            description: note,
          };
        }
      } else {
        // The real path: the practice-generator Edge Function builds the paper.
        // Failures are thrown and classified — this branch never substitutes
        // sample questions and presents them as generated ones.
        const paper = await generatePaper(config);
        questions = paper.questions;
        if (paper.shortfallNote) {
          shortfallToast = {
            title: "The paper is shorter than you asked for",
            description: paper.shortfallNote,
          };
        }
      }

      if (shortfallToast) {
        toast.push({ kind: "warning", ...shortfallToast });
      }

      const attempt: QuizAttempt = {
        id: newAttemptId(),
        branch: config.branch,
        subject: config.subject,
        topic: config.topic,
        difficulty: config.difficulty,
        sourceDocumentId: config.sourceDocumentId,
        created_at: new Date().toISOString(),
        submitted_at: null,
        questions,
      };
      await createAttempt(attempt);
      router.push(`/app/practice/${attempt.id}`);
    } catch (e) {
      if (DEMO_MODE) {
        setGenerationError({
          title: "Couldn't build the paper",
          description: String(e),
          config,
        });
      } else {
        const info = generationErrorInfo(e);
        setGenerationError({ title: info.title, description: info.description, config });
      }
    } finally {
      setBusy(false);
    }
  };

  const retryGeneration = () => {
    if (lastConfig) {
      start(lastConfig);
    }
  };

  return (
    <motion.div
      variants={staggerParent()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6"
    >
      <motion.header variants={riseIn} className="space-y-1">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-[var(--fg)]">
          <BookOpenCheck className="h-5 w-5 text-[var(--accent-text)]" aria-hidden />
          Practice
        </h1>
        <p className="text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
          Build a paper, answer it, and have it scored on GATE&apos;s marking rules: an MCQ answered
          wrongly costs one third of its marks, MSQ and NAT carry no negative marking, and a question
          left blank is always zero.
        </p>
      </motion.header>

      {!DEMO_MODE && (
        <motion.div variants={riseIn}>
          <PracticeConfigForm
            onStart={start}
            busy={busy}
            documents={documents}
            documentsError={documentsError}
            onRetryDocuments={retryDocuments}
          />
        </motion.div>
      )}

      {generationError && (
        <motion.div variants={riseIn}>
          <Alert
            tone="danger"
            title={generationError.title}
            action={
              generationError.config && (
                <Button variant="secondary" size="sm" onClick={retryGeneration}>
                  Try again
                </Button>
              )
            }
          >
            {generationError.description}
          </Alert>
        </motion.div>
      )}

      {DEMO_MODE && (
        <motion.div variants={riseIn}>
          <PracticeConfigForm
            onStart={start}
            busy={busy}
            documents={documents}
            documentsError={documentsError}
            onRetryDocuments={retryDocuments}
          />
        </motion.div>
      )}

      {recent.length > 0 ? (
        <motion.div variants={riseIn}>
          <Card>
            <CardHeader
              icon={History}
              title="Recent papers"
              description="Whether or not they were submitted."
              action={
                <Link
                  href="/app/attempts"
                  className="text-[12.5px] font-medium text-[var(--accent-text)] hover:underline"
                >
                  All attempts
                </Link>
              }
            />
            <CardBody>
              <ul className="divide-y divide-[var(--border)]">
                {recent.map((attempt) => (
                  <li key={attempt.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-[var(--fg)]">
                        {attempt.subject}
                        {attempt.topic ? ` · ${attempt.topic}` : ""}
                      </span>
                      <span className="text-[11.5px] text-[var(--fg-subtle)]">
                        {attempt.question_count} question{attempt.question_count === 1 ? "" : "s"}
                        {attempt.result
                          ? ` · ${attemptScoreLine(attempt.result)}`
                          : " · not submitted"}
                      </span>
                    </span>
                    <Link
                      href={
                        attempt.result
                          ? `/app/attempts/${attempt.id}`
                          : `/app/practice/${attempt.id}`
                      }
                      className="shrink-0 text-[12.5px] font-medium text-[var(--accent-text)] hover:underline"
                    >
                      {attempt.result ? "Review" : "Resume"}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={riseIn}>
          <EmptyState
            icon={History}
            title="No practice attempts yet"
            description="Your first paper will appear here, whether or not you finish it."
            compact
          />
        </motion.div>
      )}
    </motion.div>
  );
}
