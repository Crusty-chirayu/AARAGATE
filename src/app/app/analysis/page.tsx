"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  Loader2,
  MinusCircle,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { getAttempt, listAttempts } from "@/lib/data/attempts";
import type { QuizAttempt } from "@/lib/attempts";
import {
  analysePaper,
  buildTrendReport,
  computeStudentIntelligence,
  type PaperQuestion,
  type StudentIntelligence,
} from "@/lib/learning";
import { riseIn, staggerParent } from "@/lib/motion";

const ATTEMPTS_ANALYSED = 15;

export default function LearningPage() {
  const { push: pushToast } = useToast();

  const [questions, setQuestions] = React.useState<PaperQuestion[]>([]);
  const [attempts, setAttempts] = React.useState<QuizAttempt[]>([]);
  const [analysedCount, setAnalysedCount] = React.useState(0);
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

      const validAttempts = loaded.filter((a): a is QuizAttempt => Boolean(a));
      setAttempts(validAttempts);

      const collected: PaperQuestion[] = [];
      for (const attempt of validAttempts) {
        for (const question of attempt.questions) {
          collected.push({
            subject: question.subject,
            topic: question.topic,
            year: null,
            marks: question.marks,
            kind: question.kind,
            provenance: question.provenance,
          });
        }
      }
      setQuestions(collected);
      setAnalysedCount(validAttempts.length);
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

  const intelligence: StudentIntelligence = React.useMemo(
    () => computeStudentIntelligence(attempts),
    [attempts],
  );

  const analysis = React.useMemo(() => analysePaper(questions), [questions]);
  const trends = React.useMemo(() => buildTrendReport(questions), [questions]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl items-center justify-center gap-2.5 px-4 py-16 text-[13.5px] text-[var(--fg-muted)] sm:px-6">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-text)]" aria-hidden />
        Loading performance diagnostics & intelligence…
      </div>
    );
  }

  const hasAttempts = analysedCount > 0 && intelligence.overview.totalQuestions > 0;

  return (
    <motion.div
      variants={staggerParent()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8"
    >
      {/* Header */}
      <motion.header variants={riseIn} className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2.5 text-[22px] font-semibold tracking-tight text-[var(--fg)]">
            <BarChart3 className="h-5 w-5 text-[var(--accent-text)]" aria-hidden />
            Study Intelligence & Diagnostics
          </h1>
          {analysedCount > 0 && (
            <Badge tone="accent" size="md">
              Based on {analysedCount} recent attempt{analysedCount === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
          Real diagnostics computed from your completed papers. Track accuracy, MCQ negative marking friction,
          topic strength, and targeted practice recommendations. Zero fabricated predictions.
        </p>
      </motion.header>

      {failed || !hasAttempts ? (
        <motion.div variants={riseIn}>
          <EmptyState
            icon={BarChart3}
            title={failed ? "The analysis couldn't be built" : "No practice attempts yet"}
            description={
              failed
                ? "Reload the page to try again."
                : "Complete a practice paper to unlock real performance analytics, negative marking diagnostics, and targeted study recommendations."
            }
            action={
              failed ? (
                <Button variant="secondary" onClick={() => void load()}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Try again
                </Button>
              ) : (
                <Button asChild variant="primary" href="/app/practice">
                  Start practice paper
                </Button>
              )
            }
          />
        </motion.div>
      ) : (
        <>
          {/* Section 1: Overview Metric Cards */}
          <motion.div variants={riseIn} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--card-bg)] p-4 shadow-sm">
              <span className="text-[11.5px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
                Overall Accuracy
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[24px] font-bold tabular-nums text-[var(--fg)]">
                  {intelligence.overview.accuracyRate}%
                </span>
              </div>
              <span className="mt-1 block text-[11.5px] text-[var(--fg-muted)]">
                {intelligence.overview.correctAnswers} of {intelligence.overview.correctAnswers + intelligence.overview.wrongAnswers} answered
              </span>
            </div>

            <div className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--card-bg)] p-4 shadow-sm">
              <span className="text-[11.5px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
                Net Score
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[24px] font-bold tabular-nums text-[var(--fg)]">
                  {intelligence.overview.netScore}
                </span>
                <span className="text-[13px] text-[var(--fg-subtle)]">
                  / {intelligence.overview.maxMarks}
                </span>
              </div>
              <span className="mt-1 block text-[11.5px] text-[var(--fg-muted)]">
                Avg: {intelligence.overview.overallPercentage}%
              </span>
            </div>

            <div className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--card-bg)] p-4 shadow-sm">
              <span className="text-[11.5px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
                MCQ Penalty Lost
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[24px] font-bold tabular-nums text-[var(--danger)]">
                  -{intelligence.overview.negativeDeductions}
                </span>
                <span className="text-[12px] text-[var(--fg-subtle)]">marks</span>
              </div>
              <span className="mt-1 block text-[11.5px] text-[var(--fg-muted)]">
                From {intelligence.overview.wrongAnswers} incorrect answers
              </span>
            </div>

            <div className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--card-bg)] p-4 shadow-sm">
              <span className="text-[11.5px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
                Questions Faced
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[24px] font-bold tabular-nums text-[var(--fg)]">
                  {intelligence.overview.totalQuestions}
                </span>
              </div>
              <span className="mt-1 block text-[11.5px] text-[var(--fg-muted)]">
                {intelligence.overview.blankAnswers} left blank
              </span>
            </div>
          </motion.div>

          {/* Section 2: Actionable Recommendations */}
          {intelligence.recommendations.length > 0 && (
            <motion.div variants={riseIn}>
              <Card>
                <CardHeader
                  icon={Lightbulb}
                  title="Targeted Study Directives"
                  description="Prioritised actions derived directly from your error patterns and test coverage."
                />
                <CardBody className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {intelligence.recommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col justify-between rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5 transition-colors hover:border-[var(--border-strong)]"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13.5px] font-semibold text-[var(--fg)]">
                              {rec.title}
                            </span>
                            <Badge
                              tone={rec.priority === "high" ? "danger" : "neutral"}
                              size="sm"
                            >
                              {rec.priority === "high" ? "High Priority" : "Suggested"}
                            </Badge>
                          </div>
                          <p className="text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
                            {rec.reason}
                          </p>
                        </div>
                        <div className="mt-3.5 pt-2">
                          <Button
                            asChild
                            href={rec.actionHref}
                            variant="secondary"
                            size="sm"
                            className="w-full justify-between"
                          >
                            <span>{rec.actionLabel}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" aria-hidden />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          )}

          {/* Section 3: Subject Performance Horizontal Comparison */}
          {intelligence.bySubject.length > 0 && (
            <motion.div variants={riseIn}>
              <Card>
                <CardHeader
                  icon={Target}
                  title="Subject Performance"
                  description="Accuracy rates and negative marking impact grouped by syllabus subject."
                />
                <CardBody className="space-y-4">
                  <ul className="space-y-3.5">
                    {intelligence.bySubject.map((subj) => (
                      <li
                        key={subj.subject}
                        className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[13.5px] font-semibold text-[var(--fg)]">
                              {subj.subject}
                            </span>
                            <Badge
                              tone={
                                subj.status === "strong"
                                  ? "success"
                                  : subj.status === "fair"
                                    ? "accent"
                                    : "danger"
                              }
                              size="sm"
                            >
                              {subj.status === "strong"
                                ? "Strong"
                                : subj.status === "fair"
                                  ? "Moderate"
                                  : "Needs Practice"}
                            </Badge>
                          </div>
                          <span className="text-[12.5px] tabular-nums text-[var(--fg-muted)]">
                            {subj.correct} correct · {subj.wrong} wrong · {subj.blank} blank
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-2.5 flex items-center gap-3">
                          <div
                            aria-hidden
                            className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--border)]"
                          >
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                subj.status === "strong"
                                  ? "bg-[var(--success)]"
                                  : subj.status === "fair"
                                    ? "bg-[var(--accent)]"
                                    : "bg-[var(--danger)]"
                              }`}
                              style={{ width: `${Math.max(3, Math.min(100, subj.accuracyRate))}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-[12.5px] font-semibold tabular-nums text-[var(--fg)]">
                            {subj.accuracyRate}%
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--fg-subtle)]">
                          <span>
                            Net marks: <strong className="text-[var(--fg)]">{subj.netScore}</strong>
                            {subj.negativeDeductions > 0 && (
                              <span className="text-[var(--danger)]"> (-{subj.negativeDeductions} penalty)</span>
                            )}
                          </span>
                          <Link
                            href={`/app/practice?subject=${encodeURIComponent(subj.subject)}`}
                            className="inline-flex items-center gap-1 font-medium text-[var(--accent-text)] hover:underline"
                          >
                            <span>Practice this subject</span>
                            <ArrowRight className="h-3 w-3" aria-hidden />
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </motion.div>
          )}

          {/* Section 4: Question Type Diagnostics (MCQ vs MSQ vs NAT) */}
          <motion.div variants={riseIn}>
            <Card>
              <CardHeader
                icon={Zap}
                title="Question Type Diagnostics"
                description="Comparative metrics across standard GATE question types. Note: MSQ and NAT carry zero negative marking."
              />
              <CardBody>
                <div className="grid gap-3 sm:grid-cols-3">
                  {intelligence.byKind.map((k) => (
                    <div
                      key={k.kind}
                      className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-[var(--fg)]">
                          {k.kind}
                        </span>
                        <Badge tone="neutral" size="sm">
                          {k.total} questions
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-1.5 text-[12.5px]">
                        <div className="flex justify-between">
                          <span className="text-[var(--fg-muted)]">Accuracy</span>
                          <span className="font-semibold tabular-nums text-[var(--fg)]">
                            {k.accuracyRate}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--fg-muted)]">Correct / Wrong</span>
                          <span className="tabular-nums text-[var(--fg)]">
                            {k.correct} / {k.wrong}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--fg-muted)]">Marks Awarded</span>
                          <span className="tabular-nums text-[var(--success)]">
                            +{k.marksAwarded}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--fg-muted)]">Penalty Deductions</span>
                          <span className={`tabular-nums ${k.negativeDeductions > 0 ? "text-[var(--danger)]" : "text-[var(--fg-subtle)]"}`}>
                            {k.negativeDeductions > 0 ? `-${k.negativeDeductions}` : "0"}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-[var(--border)] pt-1 font-medium">
                          <span className="text-[var(--fg)]">Net Marks</span>
                          <span className="tabular-nums text-[var(--fg)]">
                            {k.netMarks}
                          </span>
                        </div>
                      </div>

                      <p className="mt-3 text-[11px] leading-relaxed text-[var(--fg-subtle)]">
                        {k.kind === "MCQ" && "1/3 or 2/3 penalty for wrong answers. Precision guessing carries risk."}
                        {k.kind === "MSQ" && "Multiple correct options. Zero negative penalty, but all correct options required."}
                        {k.kind === "NAT" && "Numerical answer entered via keypad. Zero negative penalty under official rules."}
                      </p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </motion.div>

          {/* Section 5: Score Progression Over Time */}
          <motion.div variants={riseIn}>
            <Card>
              <CardHeader
                icon={TrendingUp}
                title="Performance Progression"
                description="Chronological score trajectory across your submitted practice attempts."
              />
              <CardBody>
                {intelligence.hasProgressionTrend ? (
                  <div className="space-y-4">
                    <ScoreProgressionChart points={intelligence.progression} />
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-[12px] text-[var(--fg-muted)]">
                      <span>
                        Showing {intelligence.progression.length} attempts in chronological sequence.
                      </span>
                      <span className="text-[var(--fg-subtle)]">
                        Latest: {intelligence.progression[intelligence.progression.length - 1].score} / {intelligence.progression[intelligence.progression.length - 1].maxMarks} marks
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-center">
                    <p className="text-[13px] font-medium text-[var(--fg)]">
                      Progression curve requires at least 2 submitted attempts
                    </p>
                    <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
                      You currently have {intelligence.progression.length} submitted attempt recorded. Complete another practice paper to view your chronological trajectory.
                    </p>
                    <div className="mt-3">
                      <Button asChild variant="secondary" size="sm" href="/app/practice">
                        Start another paper
                      </Button>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </motion.div>

          {/* Section 6: Evidence-Based Pattern Recognition */}
          {intelligence.patterns.length > 0 && (
            <motion.div variants={riseIn}>
              <Card>
                <CardHeader
                  icon={Sparkles}
                  title="Evidence-Based Diagnostic Patterns"
                  description="Empirical patterns observed in your practice history. Formulated without ungrounded predictive claims."
                />
                <CardBody>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {intelligence.patterns.map((pat, idx) => (
                      <div
                        key={idx}
                        className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5"
                      >
                        <div className="flex items-center gap-2">
                          <Badge tone="neutral" size="sm">
                            {pat.tag}
                          </Badge>
                        </div>
                        <h4 className="mt-2 text-[13.5px] font-semibold text-[var(--fg)]">
                          {pat.title}
                        </h4>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
                          {pat.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          )}

          {/* Section 7: Topic Breakdown */}
          {intelligence.byTopic.length > 0 && (
            <motion.div variants={riseIn}>
              <Card>
                <CardHeader
                  icon={BarChart3}
                  title="Topic Breakdown"
                  description="Detailed error and accuracy rates across specific syllabus topics."
                />
                <CardBody>
                  <div className="max-h-80 overflow-y-auto pr-1">
                    <table className="w-full text-left text-[12.5px]">
                      <thead className="sticky top-0 bg-[var(--card-bg)] text-[11px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
                        <tr className="border-b border-[var(--border)]">
                          <th className="py-2 pr-3">Topic / Subject</th>
                          <th className="py-2 px-2 text-right">Faced</th>
                          <th className="py-2 px-2 text-right">Accuracy</th>
                          <th className="py-2 px-2 text-right">Errors</th>
                          <th className="py-2 pl-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {intelligence.byTopic.map((top) => (
                          <tr key={`${top.subject}-${top.topic}`} className="hover:bg-[var(--bg-subtle)]">
                            <td className="py-2.5 pr-3">
                              <span className="font-medium text-[var(--fg)]">{top.topic}</span>
                              <span className="block text-[11px] text-[var(--fg-subtle)]">{top.subject}</span>
                            </td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-[var(--fg)]">
                              {top.questionsFaced}
                            </td>
                            <td className="py-2.5 px-2 text-right tabular-nums">
                              <span
                                className={`font-semibold ${
                                  top.accuracyRate >= 70
                                    ? "text-[var(--success)]"
                                    : top.accuracyRate >= 45
                                      ? "text-[var(--accent-text)]"
                                      : "text-[var(--danger)]"
                                }`}
                              >
                                {top.accuracyRate}%
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-[var(--fg-muted)]">
                              {top.wrong > 0 ? (
                                <span className="text-[var(--danger)]">{top.wrong}</span>
                              ) : (
                                "0"
                              )}
                            </td>
                            <td className="py-2.5 pl-2 text-right">
                              <Link
                                href={`/app/practice?subject=${encodeURIComponent(top.subject)}&topic=${encodeURIComponent(top.topic)}`}
                                className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-[var(--accent-text)] hover:underline"
                              >
                                <span>Practice</span>
                                <ArrowRight className="h-3 w-3" aria-hidden />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          )}

          {/* Section 8: Historical Question Mix & GATE Official Past Trends Statement */}
          <motion.div variants={riseIn}>
            <Card>
              <CardHeader
                icon={TrendingUp}
                title="Historical Trends & Dataset Integrity"
                description="Movement in subject representation across official past papers."
              />
              <CardBody className="space-y-3">
                <p className="text-[13px] leading-relaxed text-[var(--fg)]">
                  No multi-year examination trend is reported, and none is being fabricated.
                </p>
                <p className="text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
                  A trend requires comparing a subject&apos;s mean marks per question between past
                  paper years using source-derived questions with a verified year.{" "}
                  {trends.years.length === 0
                    ? "Your currently loaded study materials do not record explicit past paper years"
                    : `Only ${trends.years.length} year${trends.years.length === 1 ? "" : "s"} of dated records exist`}
                  , so the historical dataset remains conservative to prevent misleading extrapolations.
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Figure label="Eligible" value={String(trends.considered)} />
                  <Figure label="Too thin" value={String(trends.insufficient)} />
                  <Figure label="No year" value={String(trends.excludedUndated)} />
                  <Figure label="AI-generated" value={String(trends.excludedGenerated)} />
                </dl>
                <p className="text-[12px] leading-relaxed text-[var(--fg-subtle)]">
                  AI-generated practice questions are excluded from all past-paper trend calculations
                  by design, ensuring that synthetic practice never pollutes official exam statistics.
                </p>
              </CardBody>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--bg-subtle)] p-2.5">
      <dt className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--fg)]">{value}</dd>
    </div>
  );
}

/** SVG Score Progression Chart for >= 2 points */
function ScoreProgressionChart({ points }: { points: StudentIntelligence["progression"] }) {
  if (points.length < 2) return null;

  const width = 600;
  const height = 160;
  const paddingX = 40;
  const paddingY = 24;

  const maxVal = Math.max(100, ...points.map((p) => p.percentage));
  const minVal = 0;

  const getX = (idx: number) => {
    return paddingX + (idx / (points.length - 1)) * (width - 2 * paddingX);
  };

  const getY = (val: number) => {
    const range = maxVal - minVal || 1;
    return height - paddingY - ((val - minVal) / range) * (height - 2 * paddingY);
  };

  const pathD = points.reduce((acc, p, idx) => {
    const x = getX(idx);
    const y = getY(p.percentage);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, "");

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        aria-label="Score progression chart"
        role="img"
      >
        {/* Horizontal grid lines */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = getY(tick);
          return (
            <g key={tick}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={paddingX - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-[var(--fg-subtle)] text-[10px]"
              >
                {tick}%
              </text>
            </g>
          );
        })}

        {/* The trend line */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, idx) => {
          const x = getX(idx);
          const y = getY(p.percentage);
          return (
            <g key={p.attemptId}>
              <circle
                cx={x}
                cy={y}
                r="4.5"
                className="fill-[var(--card-bg)] stroke-[var(--accent)]"
                strokeWidth="2.5"
              />
              <text
                x={x}
                y={y - 8}
                textAnchor="middle"
                className="fill-[var(--fg)] text-[11px] font-semibold tabular-nums"
              >
                {p.percentage}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
