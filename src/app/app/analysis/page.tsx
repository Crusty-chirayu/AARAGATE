"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BarChart3, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { getAttempt, listAttempts } from "@/lib/data/attempts";
import { analysePaper, buildTrendReport, type PaperQuestion } from "@/lib/learning";
import { riseIn, staggerParent } from "@/lib/motion";

/**
 * How many recent attempts feed the analysis.
 *
 * Bounded on purpose: the analysis reads each attempt's full question set, and
 * an unbounded scan would turn opening this screen into a long request. The cap
 * is stated on the page so the numbers are never mistaken for "all time".
 */
const ATTEMPTS_ANALYSED = 10;

/**
 * Analysis of the questions you have actually practised.
 *
 * WHAT THIS IS: the composition of the practice questions in your recent
 * attempts — the MCQ/MSQ/NAT mix, and the subject and topic spread.
 *
 * WHAT THIS IS NOT: a trend, a prediction, or a claim about real GATE papers.
 * `buildTrendReport` needs source-derived questions with recorded years, and
 * nothing in this build supplies those, so the trend section reports that it
 * has no data rather than plotting a flat line and calling it insight. That is
 * the honest outcome, and the screen says so instead of hiding the section.
 */
export default function LearningPage() {
  const { push: pushToast } = useToast();

  const [questions, setQuestions] = React.useState<PaperQuestion[]>([]);
  const [analysed, setAnalysed] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(async () => {
    setFailed(false);
    try {
      const recent = (await listAttempts()).slice(0, ATTEMPTS_ANALYSED);
      const loaded = await Promise.all(
        recent.map(async (summary) => {
          try {
            return await getAttempt(summary.id);
          } catch {
            return null;
          }
        }),
      );

      const collected: PaperQuestion[] = [];
      for (const attempt of loaded) {
        if (!attempt) continue;
        for (const question of attempt.questions) {
          collected.push({
            subject: question.subject,
            topic: question.topic,
            // No year is recorded anywhere in this build. Leaving it null is
            // what keeps these questions out of the trend calculation instead
            // of being attributed to an arbitrary year.
            year: null,
            marks: question.marks,
            kind: question.kind,
            provenance: question.provenance,
          });
        }
      }
      setQuestions(collected);
      setAnalysed(loaded.filter(Boolean).length);
      setFailed(false);
    } catch (e) {
      pushToast({ kind: "error", title: "Couldn't build the analysis", description: String(e) });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const analysis = React.useMemo(() => analysePaper(questions), [questions]);
  const trends = React.useMemo(() => buildTrendReport(questions), [questions]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-10 text-[13px] text-[var(--fg-muted)] sm:px-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Reading your attempts…
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
          <BarChart3 className="h-5 w-5 text-[var(--accent-text)]" aria-hidden />
          Analysis
        </h1>
        <p className="text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
          The composition of the practice questions in your {analysed} most recent attempt
          {analysed === 1 ? "" : "s"}. These are questions you have practised, not an official GATE
          paper.
        </p>
      </motion.header>

      {failed || analysis.total === 0 ? (
        <motion.div variants={riseIn}>
          <EmptyState
            icon={BarChart3}
            title={failed ? "The analysis couldn't be built" : "Nothing to analyse yet"}
            description={
              failed
                ? "Reload the page to try again."
                : "Answer a practice paper and its questions will be summarised here."
            }
            action={
              failed ? (
                <Button variant="secondary" onClick={() => void load()}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Try again
                </Button>
              ) : (
                <Button asChild variant="secondary" href="/app/practice">
                  Go to practice
                </Button>
              )
            }
          />
        </motion.div>
      ) : (
        <>
          <motion.div variants={riseIn}>
            <Card>
              <CardHeader
                icon={BarChart3}
                title="Question mix"
                description={`${analysis.total} question${analysis.total === 1 ? "" : "s"} · ${analysis.marks} mark${analysis.marks === 1 ? "" : "s"} in total`}
              />
              <CardBody>
                <DistributionList title="By kind" rows={analysis.byKind} />
                <DistributionList title="By subject" rows={analysis.bySubject} />
                <DistributionList title="By topic" rows={analysis.byTopic} />
                <p className="mt-3 text-[12px] text-[var(--fg-subtle)]">
                  {analysis.unclassified === 0
                    ? "Every question has a recorded subject."
                    : `${analysis.unclassified} question${analysis.unclassified === 1 ? "" : "s"} had no recorded subject.`}
                  {analysis.generated > 0
                    ? ` ${analysis.generated} were AI-generated rather than sample questions.`
                    : " All of them are labelled sample questions."}
                </p>
              </CardBody>
            </Card>
          </motion.div>

          <motion.div variants={riseIn}>
            <Card>
              <CardHeader
                icon={TrendingUp}
                title="Trends"
                description="Movement in a subject across past papers."
              />
              <CardBody>
                <p className="text-[13px] leading-relaxed text-[var(--fg)]">
                  No trend is reported, and none is being estimated.
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
                  A trend here means comparing a subject&apos;s mean marks per question between past
                  paper years, using source-derived questions with a recorded year.{" "}
                  {trends.years.length === 0
                    ? "Nothing in this build records a paper year"
                    : `Only ${trends.years.length} year${trends.years.length === 1 ? "" : "s"} of data exist`}
                  , so the dataset is empty and any movement shown would be invented. This screen
                  reports that instead of drawing one.
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Figure label="Eligible" value={String(trends.considered)} />
                  <Figure label="Too thin" value={String(trends.insufficient)} />
                  <Figure label="No year" value={String(trends.excludedUndated)} />
                  <Figure label="AI-generated" value={String(trends.excludedGenerated)} />
                </dl>
                <p className="mt-3 text-[12px] leading-relaxed text-[var(--fg-subtle)]">
                  AI-generated questions are excluded from any trend, because a trend is a statement
                  about real papers. A subject also needs at least two distinct years and five
                  questions before a movement is stated at all.
                </p>
              </CardBody>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

/** A single figure in a summary grid. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--fg)]">{value}</dd>
    </div>
  );
}


/** A labelled breakdown with a proportional bar per row. */
function DistributionList({
  title,
  rows,
}: {
  title: string;
  rows: ReadonlyArray<{ label: string; count: number; marks: number; share: number }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 first:mt-0">
      <h3 className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
        {title}
      </h3>
      <ul className="mt-1.5 space-y-1.5">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 truncate text-[var(--fg)]">{row.label}</span>
              <span className="shrink-0 tabular-nums text-[var(--fg-muted)]">
                {row.count} · {row.share}% · {row.marks} mark{row.marks === 1 ? "" : "s"}
              </span>
            </div>
            {/* Decorative: the count and share beside it carry the same
                information as text, so the bar is hidden from assistive tech. */}
            <div
              aria-hidden
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]"
            >
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(2, Math.min(100, row.share))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

