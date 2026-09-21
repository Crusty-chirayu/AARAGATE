"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { History, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { attemptPercentage, attemptScoreLine } from "@/lib/attempts";
import { deleteAttempt, listAttempts, type AttemptSummary } from "@/lib/data/attempts";
import { riseIn, staggerParent } from "@/lib/motion";
import { relativeTime } from "@/lib/utils";

/**
 * Practice attempt history.
 *
 * Rows are `AttemptSummary`, not full attempts: the list needs metadata and the
 * stored score, and `question_count` stands in for the questions. Nothing here
 * can render a blank paper that looks like a failed load.
 *
 * A paper that was never submitted is listed too, as "not submitted" with a
 * resume link — an abandoned paper is a real state, and hiding it would make the
 * history read as though the attempt never happened.
 */
export default function AttemptsPage() {
  const { push: pushToast } = useToast();

  const [attempts, setAttempts] = React.useState<AttemptSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [discarding, setDiscarding] = React.useState<AttemptSummary | null>(null);

  const load = React.useCallback(async () => {
    try {
      setAttempts(await listAttempts());
    } catch (e) {
      pushToast({ kind: "error", title: "Couldn't load your history", description: String(e) });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const discard = async () => {
    if (!discarding) return;
    try {
      await deleteAttempt(discarding.id);
      setAttempts((prev) => prev.filter((attempt) => attempt.id !== discarding.id));
      pushToast({ kind: "success", title: "Attempt deleted" });
    } catch (e) {
      pushToast({ kind: "error", title: "Couldn't delete the attempt", description: String(e) });
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-10 text-[13px] text-[var(--fg-muted)] sm:px-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your attempts…
      </div>
    );
  }


  return (
    <motion.div
      variants={staggerParent()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6"
    >
      <motion.header variants={riseIn} className="space-y-1">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-[var(--fg)]">
          <History className="h-5 w-5 text-[var(--accent-text)]" aria-hidden />
          Practice attempts
        </h1>
        <p className="text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
          Every paper you have built, newest first. Scores use GATE marking: a wrong MCQ is negative,
          MSQ and NAT are not, and a blank question is zero.
        </p>
      </motion.header>

      {failed || attempts.length === 0 ? (
        <motion.div variants={riseIn}>
          <EmptyState
            icon={History}
            title={failed ? "Your history couldn't be loaded" : "No attempts yet"}
            description={
              failed
                ? "Reload the page to try again."
                : "Build a practice paper and it will be recorded here."
            }
            action={
              <Button asChild variant="secondary" href="/app/practice">
                Go to practice
              </Button>
            }
          />
        </motion.div>
      ) : (
        <motion.div variants={riseIn}>
          <Card>
            <CardHeader
              icon={History}
              title={`${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`}
              description="Open one to see the per-question review."
            />
            <CardBody>
              <ul className="divide-y divide-[var(--border)]">
                {attempts.map((attempt) => (
                  <li key={attempt.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={
                          attempt.submitted_at
                            ? `/app/attempts/${attempt.id}`
                            : `/app/practice/${attempt.id}`
                        }
                        className="block truncate text-[13.5px] font-medium text-[var(--fg)] hover:text-[var(--accent-text)]"
                      >
                        {attempt.subject}
                        {attempt.topic ? ` · ${attempt.topic}` : ""}
                      </Link>
                      <p className="mt-0.5 text-[11.5px] text-[var(--fg-subtle)]">
                        {attempt.question_count} question{attempt.question_count === 1 ? "" : "s"} ·{" "}
                        {attempt.difficulty} · {relativeTime(attempt.created_at)}
                      </p>
                      <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
                        {attempt.result ? (
                          <>
                            <span className="tabular-nums">{attemptScoreLine(attempt.result)}</span>
                            {` · ${attemptPercentage(attempt.result)}%`}
                          </>
                        ) : (
                          "Not submitted"
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label={`Delete the ${attempt.subject} attempt`}
                      onClick={() => setDiscarding(attempt)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </motion.div>
      )}

      <ConfirmDialog
        open={discarding !== null}
        onClose={() => setDiscarding(null)}
        onConfirm={discard}
        title="Delete this attempt?"
        confirmLabel="Delete"
        description={
          discarding
            ? `This removes the ${discarding.subject} paper and its score permanently. It cannot be undone.`
            : undefined
        }
      />
    </motion.div>
  );
}
