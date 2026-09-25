/**
 * Question-paper analysis and historical trends (core MVP priority 8).
 *
 * Pure and deterministic — no clock, no randomness, no database. This module
 * answers two questions a student can act on:
 *
 *   1. **What is in this paper?** `analysePaper` reports the kind mix and the
 *      subject/topic distribution of the questions it is given, by count and by
 *      marks.
 *   2. **How has a subject moved over the years?** `buildTrendReport` compares
 *      the mean marks per question, per subject, between the earliest and latest
 *      year it has data for.
 *
 * WHAT THIS REFUSES TO DO.
 *
 *  - **It will not invent a trend from too little data.** A subject needs at
 *    least `MIN_YEARS_FOR_TREND` distinct years and `MIN_QUESTIONS_FOR_TREND`
 *    questions before any movement is stated; below that the movement is
 *    returned with `sufficient: false` and no direction, and an entirely
 *    unsupported report is simply `empty`.
 *  - **It will not mix AI-generated questions into a claim about real papers.**
 *    Trends describe past papers, so generated practice material is excluded
 *    and counted as `excludedGenerated` instead — the excluded count is on the
 *    report rather than silently dropped.
 *  - **It will not predict anything.** There is no extrapolation, no forecast
 *    and no rank/score estimate anywhere in this module. A movement is a
 *    statement about the questions actually supplied.
 *
 * A question with no known year cannot take part in a trend, so it is counted
 * as `excludedUndated` rather than being attributed to an arbitrary year.
 */
import type { QuestionKind } from "./quiz";
import type { QuestionProvenance, QuizAttempt } from "./attempts";

/** Label for a question whose subject or topic is not recorded. */
export const UNCLASSIFIED = "Unclassified";

/** A movement needs at least this many distinct years before it is stated. */
export const MIN_YEARS_FOR_TREND = 2;

/** …and at least this many eligible questions. */
export const MIN_QUESTIONS_FOR_TREND = 5;

/** One source-derived question from a past paper. */
export interface PaperQuestion {
  /** `null` when the question's subject is not recorded. */
  subject: string | null;
  topic: string | null;
  /** The paper year, or `null` when unknown. An undated question cannot trend. */
  year: number | null;
  marks: number;
  kind: QuestionKind;
  provenance: QuestionProvenance;
}

/** A count/marks bucket in a paper's distribution. */
export interface Distribution {
  label: string;
  count: number;
  marks: number;
  /** Share of the paper by count, as a percentage to one decimal. */
  share: number;
}

export interface PaperAnalysis {
  /** Every question considered. */
  total: number;
  /** Total marks across those questions. */
  marks: number;
  /** Questions with no recorded subject. */
  unclassified: number;
  /** Questions with no recorded year. */
  undated: number;
  /** AI-generated questions — present in the paper, never in a trend. */
  generated: number;
  byKind: Distribution[];
  bySubject: Distribution[];
  byTopic: Distribution[];
}

export interface TrendYear {
  year: number;
  count: number;
  /** Mean marks per question in that year, to two decimals. */
  meanMarks: number;
}

export interface TrendMovement {
  subject: string;
  /** Oldest first. */
  years: TrendYear[];
  /** Change in mean marks per question, latest minus earliest. */
  delta: number;
  /** `null` when coverage is too thin to state a direction. */
  direction: "up" | "down" | "flat" | null;
  /** False when the subject does not meet the coverage thresholds. */
  sufficient: boolean;
}

export interface TrendReport {
  /** Source-derived questions that carried a year. */
  considered: number;
  /** Eligible questions left out of a statement because coverage was thin. */
  insufficient: number;
  /** AI-generated questions excluded from every movement. */
  excludedGenerated: number;
  /** Undated questions excluded from every movement. */
  excludedUndated: number;
  /** Years represented, ascending. */
  years: number[];
  /** One entry per subject, in label order. */
  movements: TrendMovement[];
  /** True when no movement in this report is supported by enough data. */
  empty: boolean;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Bucket questions by a label, reporting count, marks and share.
 *
 * Buckets are built in encounter order and sorted by count, so the same input
 * always produces the same output — a report that reshuffles between renders
 * would look like the data changed when it did not.
 */
function distribute(
  questions: readonly PaperQuestion[],
  labelOf: (question: PaperQuestion) => string,
): Distribution[] {
  const buckets = new Map<string, { count: number; marks: number }>();

  for (const question of questions) {
    const label = labelOf(question) || UNCLASSIFIED;
    const bucket = buckets.get(label) ?? { count: 0, marks: 0 };
    bucket.count += 1;
    bucket.marks = round2(bucket.marks + (Number.isFinite(question.marks) ? question.marks : 0));
    buckets.set(label, bucket);
  }

  const total = questions.length;
  return [...buckets.entries()]
    .map(([label, bucket]) => ({
      label,
      count: bucket.count,
      marks: bucket.marks,
      share: total === 0 ? 0 : Math.round((bucket.count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Describe a paper: its kind mix, and its subject and topic distribution.
 *
 * Reports the excluded and unknown counts rather than hiding them, so a screen
 * can say plainly that some questions are AI-generated and are not part of a
 * distribution over real papers.
 */
export function analysePaper(questions: readonly PaperQuestion[]): PaperAnalysis {
  const safe = questions.filter((question) => question && typeof question === "object");

  return {
    total: safe.length,
    marks: round2(
      safe.reduce((sum, question) => sum + (Number.isFinite(question.marks) ? question.marks : 0), 0),
    ),
    unclassified: safe.filter((question) => !question.subject || question.subject.trim() === "")
      .length,
    undated: safe.filter((question) => question.year === null).length,
    generated: safe.filter((question) => question.provenance === "ai_generated").length,
    byKind: distribute(safe, (question) => question.kind),
    bySubject: distribute(safe, (question) => question.subject?.trim() ?? ""),
    byTopic: distribute(safe, (question) => question.topic?.trim() ?? ""),
  };
}

/** Which way a delta points. Zero is flat, not a trend. */
export function directionOf(delta: number): "up" | "down" | "flat" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

/**
 * Per-subject movement between the earliest and latest year on record.
 *
 * Only source-derived, dated questions take part. A subject that does not reach
 * both thresholds is returned with `sufficient: false` and a `null` direction —
 * it stays visible in the report as "not enough data" rather than being dropped,
 * because silently omitting a subject reads as "no change".
 */
export function buildTrendReport(questions: readonly PaperQuestion[]): TrendReport {
  const all = questions.filter((question) => question && typeof question === "object");
  const excludedGenerated = all.filter((q) => q.provenance === "ai_generated").length;
  const eligible = all.filter((q) => q.provenance !== "ai_generated" && q.year !== null);
  const excludedUndated = all.filter(
    (q) => q.provenance !== "ai_generated" && q.year === null,
  ).length;

  const bySubject = new Map<string, PaperQuestion[]>();
  for (const question of eligible) {
    const subject = question.subject?.trim() || UNCLASSIFIED;
    const bucket = bySubject.get(subject) ?? [];
    bucket.push(question);
    bySubject.set(subject, bucket);
  }

  const years = [...new Set(eligible.map((question) => question.year as number))].sort(
    (a, b) => a - b,
  );

  let insufficient = 0;
  const movements: TrendMovement[] = [...bySubject.entries()]
    .map(([subject, entries]) => {
      const perYear = new Map<number, number[]>();
      for (const entry of entries) {
        const year = entry.year as number;
        const bucket = perYear.get(year) ?? [];
        bucket.push(Number.isFinite(entry.marks) ? entry.marks : 0);
        perYear.set(year, bucket);
      }

      const trendYears: TrendYear[] = [...perYear.entries()]
        .map(([year, marks]) => ({
          year,
          count: marks.length,
          meanMarks: round2(marks.reduce((sum, value) => sum + value, 0) / marks.length),
        }))
        .sort((a, b) => a.year - b.year);

      const sufficient =
        trendYears.length >= MIN_YEARS_FOR_TREND && entries.length >= MIN_QUESTIONS_FOR_TREND;
      if (!sufficient) insufficient += entries.length;

      const delta = sufficient
        ? round2(trendYears[trendYears.length - 1].meanMarks - trendYears[0].meanMarks)
        : 0;

      return {
        subject,
        years: trendYears,
        delta,
        direction: sufficient ? directionOf(delta) : null,
        sufficient,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));

  return {
    considered: eligible.length,
    insufficient,
    excludedGenerated,
    excludedUndated,
    years,
    movements,
    empty: movements.every((movement) => !movement.sufficient),
  };
}

export interface PerformanceOverview {
  totalAttempts: number;
  submittedAttempts: number;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  blankAnswers: number;
  marksAwarded: number;
  maxMarks: number;
  negativeDeductions: number;
  netScore: number;
  accuracyRate: number;
  overallPercentage: number;
}

export interface SubjectIntelligence {
  subject: string;
  attemptsCount: number;
  questionsFaced: number;
  correct: number;
  wrong: number;
  blank: number;
  marksAwarded: number;
  maxMarks: number;
  negativeDeductions: number;
  netScore: number;
  accuracyRate: number;
  status: "strong" | "fair" | "needs_practice";
}

export interface TopicIntelligence {
  topic: string;
  subject: string;
  questionsFaced: number;
  correct: number;
  wrong: number;
  blank: number;
  accuracyRate: number;
}

export interface QuestionTypeIntelligence {
  kind: QuestionKind;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  marksAwarded: number;
  negativeDeductions: number;
  netMarks: number;
  accuracyRate: number;
}

export interface AttemptProgressionPoint {
  attemptId: string;
  date: string;
  subject: string;
  score: number;
  maxMarks: number;
  percentage: number;
  accuracyRate: number;
}

export interface PatternInsight {
  type: "frequency" | "concept" | "structure" | "deduction";
  tag: "Detected pattern" | "Frequently observed" | "Recurring concept" | "Observed in available material";
  title: string;
  description: string;
}

export interface Recommendation {
  title: string;
  reason: string;
  actionLabel: string;
  actionHref: string;
  priority: "high" | "medium" | "low";
}

export interface StudentIntelligence {
  overview: PerformanceOverview;
  bySubject: SubjectIntelligence[];
  byTopic: TopicIntelligence[];
  byKind: QuestionTypeIntelligence[];
  progression: AttemptProgressionPoint[];
  hasProgressionTrend: boolean;
  patterns: PatternInsight[];
  recommendations: Recommendation[];
}

/**
 * Pure and deterministic calculation of student preparation intelligence
 * strictly from actual sat attempts. Zero fabricated data or predictions.
 */
export function computeStudentIntelligence(attempts: readonly QuizAttempt[]): StudentIntelligence {
  const safeAttempts = attempts.filter((a) => a && typeof a === "object");
  const submitted = safeAttempts.filter((a) => a.submitted_at && a.result);

  let totalQuestions = 0;
  let correctAnswers = 0;
  let wrongAnswers = 0;
  let blankAnswers = 0;
  let marksAwarded = 0;
  let maxMarks = 0;
  let negativeDeductions = 0;
  let netScore = 0;

  for (const attempt of submitted) {
    const res = attempt.result!;
    correctAnswers += res.correct;
    wrongAnswers += res.wrong;
    blankAnswers += res.unanswered;
    totalQuestions += attempt.questions.length;
    maxMarks += res.max;
    netScore += res.awarded;

    // Deductions come from negative verdicts
    const verdicts = attempt.verdicts ?? {};
    let attemptDeduction = 0;
    let attemptAwarded = 0;
    attempt.questions.forEach((_q, idx) => {
      const v = verdicts[idx];
      if (v) {
        if (v.outcome === "correct") {
          attemptAwarded += v.awarded;
        } else if (v.outcome === "wrong" && v.awarded < 0) {
          attemptDeduction += Math.abs(v.awarded);
        }
      }
    });
    negativeDeductions += attemptDeduction;
    marksAwarded += attemptAwarded;
  }

  const answeredTotal = correctAnswers + wrongAnswers;
  const accuracyRate = answeredTotal > 0 ? round2((correctAnswers / answeredTotal) * 100) : 0;
  const overallPercentage = maxMarks > 0 ? round2((netScore / maxMarks) * 100) : 0;

  const overview: PerformanceOverview = {
    totalAttempts: safeAttempts.length,
    submittedAttempts: submitted.length,
    totalQuestions,
    correctAnswers,
    wrongAnswers,
    blankAnswers,
    marksAwarded: round2(marksAwarded),
    maxMarks: round2(maxMarks),
    negativeDeductions: round2(negativeDeductions),
    netScore: round2(netScore),
    accuracyRate,
    overallPercentage,
  };

  // 1. By Subject
  const subjectMap = new Map<
    string,
    {
      attempts: Set<string>;
      questions: number;
      correct: number;
      wrong: number;
      blank: number;
      marksAwarded: number;
      maxMarks: number;
      negativeDeductions: number;
      netScore: number;
    }
  >();

  for (const attempt of submitted) {
    const verdicts = attempt.verdicts ?? {};
    attempt.questions.forEach((q, idx) => {
      const subj = q.subject?.trim() || attempt.subject?.trim() || UNCLASSIFIED;
      const cur = subjectMap.get(subj) ?? {
        attempts: new Set<string>(),
        questions: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        marksAwarded: 0,
        maxMarks: 0,
        negativeDeductions: 0,
        netScore: 0,
      };
      cur.attempts.add(attempt.id);
      cur.questions += 1;
      cur.maxMarks += q.marks;

      const v = verdicts[idx];
      if (v?.outcome === "correct") {
        cur.correct += 1;
        cur.marksAwarded += v.awarded;
        cur.netScore += v.awarded;
      } else if (v?.outcome === "wrong") {
        cur.wrong += 1;
        const penalty = v.awarded < 0 ? Math.abs(v.awarded) : 0;
        cur.negativeDeductions += penalty;
        cur.netScore += v.awarded; // v.awarded is negative or 0
      } else {
        cur.blank += 1;
      }
      subjectMap.set(subj, cur);
    });
  }

  const bySubject: SubjectIntelligence[] = [...subjectMap.entries()]
    .map(([subject, data]) => {
      const answered = data.correct + data.wrong;
      const acc = answered > 0 ? round2((data.correct / answered) * 100) : 0;
      const status: "strong" | "fair" | "needs_practice" =
        acc >= 70 ? "strong" : acc >= 50 ? "fair" : "needs_practice";
      return {
        subject,
        attemptsCount: data.attempts.size,
        questionsFaced: data.questions,
        correct: data.correct,
        wrong: data.wrong,
        blank: data.blank,
        marksAwarded: round2(data.marksAwarded),
        maxMarks: round2(data.maxMarks),
        negativeDeductions: round2(data.negativeDeductions),
        netScore: round2(data.netScore),
        accuracyRate: acc,
        status,
      };
    })
    .sort((a, b) => b.questionsFaced - a.questionsFaced);

  // 2. By Topic
  const topicMap = new Map<
    string,
    { subject: string; count: number; correct: number; wrong: number; blank: number }
  >();

  for (const attempt of submitted) {
    const verdicts = attempt.verdicts ?? {};
    attempt.questions.forEach((q, idx) => {
      if (!q.topic || q.topic.trim() === "") return;
      const topicName = q.topic.trim();
      const subj = q.subject?.trim() || attempt.subject?.trim() || UNCLASSIFIED;
      const cur = topicMap.get(topicName) ?? {
        subject: subj,
        count: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
      };
      cur.count += 1;
      const v = verdicts[idx];
      if (v?.outcome === "correct") cur.correct += 1;
      else if (v?.outcome === "wrong") cur.wrong += 1;
      else cur.blank += 1;
      topicMap.set(topicName, cur);
    });
  }

  const byTopic: TopicIntelligence[] = [...topicMap.entries()]
    .map(([topic, data]) => {
      const answered = data.correct + data.wrong;
      const acc = answered > 0 ? round2((data.correct / answered) * 100) : 0;
      return {
        topic,
        subject: data.subject,
        questionsFaced: data.count,
        correct: data.correct,
        wrong: data.wrong,
        blank: data.blank,
        accuracyRate: acc,
      };
    })
    .sort((a, b) => b.wrong - a.wrong || b.questionsFaced - a.questionsFaced);

  // 3. By Question Type (MCQ, MSQ, NAT)
  const kinds: QuestionKind[] = ["MCQ", "MSQ", "NAT"];
  const byKind: QuestionTypeIntelligence[] = kinds.map((kind) => {
    let total = 0;
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    let marksAwardedKind = 0;
    let negativeDeductionsKind = 0;

    for (const attempt of submitted) {
      const verdicts = attempt.verdicts ?? {};
      attempt.questions.forEach((q, idx) => {
        if (q.kind === kind) {
          total += 1;
          const v = verdicts[idx];
          if (v?.outcome === "correct") {
            correct += 1;
            marksAwardedKind += v.awarded;
          } else if (v?.outcome === "wrong") {
            wrong += 1;
            const penalty = v.awarded < 0 ? Math.abs(v.awarded) : 0;
            negativeDeductionsKind += penalty;
          } else {
            blank += 1;
          }
        }
      });
    }

    const answered = correct + wrong;
    const acc = answered > 0 ? round2((correct / answered) * 100) : 0;
    return {
      kind,
      total,
      correct,
      wrong,
      blank,
      marksAwarded: round2(marksAwardedKind),
      negativeDeductions: round2(negativeDeductionsKind),
      netMarks: round2(marksAwardedKind - negativeDeductionsKind),
      accuracyRate: acc,
    };
  });

  // 4. Progression Over Time (chronological)
  const progression: AttemptProgressionPoint[] = [...submitted]
    .sort(
      (a, b) =>
        new Date(a.submitted_at || a.created_at).getTime() -
        new Date(b.submitted_at || b.created_at).getTime(),
    )
    .map((attempt) => {
      const res = attempt.result!;
      const answered = res.correct + res.wrong;
      const acc = answered > 0 ? round2((res.correct / answered) * 100) : 0;
      const pct = res.max > 0 ? round2((res.awarded / res.max) * 100) : 0;
      return {
        attemptId: attempt.id,
        date: attempt.submitted_at || attempt.created_at,
        subject: attempt.subject,
        score: res.awarded,
        maxMarks: res.max,
        percentage: pct,
        accuracyRate: acc,
      };
    });

  // 5. Evidence-based Pattern Recognition
  const patterns: PatternInsight[] = [];
  if (submitted.length > 0) {
    // Check MCQ penalty impact
    const mcqData = byKind.find((k) => k.kind === "MCQ");
    if (mcqData && mcqData.negativeDeductions > 0) {
      patterns.push({
        type: "deduction",
        tag: "Detected pattern",
        title: "Negative marking friction on MCQs",
        description: `Incorrect MCQs resulted in ${mcqData.negativeDeductions} marks deducted across your attempts. MSQ and NAT questions carry zero penalty under official GATE rules.`,
      });
    }

    // Check NAT presence
    const natData = byKind.find((k) => k.kind === "NAT");
    if (natData && natData.total > 0) {
      const share = totalQuestions > 0 ? round2((natData.total / totalQuestions) * 100) : 0;
      patterns.push({
        type: "structure",
        tag: "Observed in available material",
        title: "Numerical Answer Type (NAT) representation",
        description: `NAT questions account for ${share}% of all questions faced (${natData.total} questions) with an accuracy rate of ${natData.accuracyRate}%.`,
      });
    }

    // Check recurring concepts
    const topRecurringTopic = byTopic.find((t) => t.questionsFaced >= 2);
    if (topRecurringTopic) {
      patterns.push({
        type: "concept",
        tag: "Recurring concept",
        title: `Repeated emphasis on "${topRecurringTopic.topic}"`,
        description: `Observed across ${topRecurringTopic.questionsFaced} practice questions in ${topRecurringTopic.subject}. Accuracy on this topic is currently ${topRecurringTopic.accuracyRate}%.`,
      });
    }

    // Check primary subject density
    if (bySubject.length > 0) {
      const primary = bySubject[0];
      const subjShare = totalQuestions > 0 ? round2((primary.questionsFaced / totalQuestions) * 100) : 0;
      patterns.push({
        type: "frequency",
        tag: "Frequently observed",
        title: `High study focus on ${primary.subject}`,
        description: `${primary.subject} represents ${subjShare}% of questions attempted (${primary.questionsFaced} questions across ${primary.attemptsCount} paper${primary.attemptsCount === 1 ? "" : "s"}).`,
      });
    }
  }

  // 6. Actionable Recommendations
  const recommendations: Recommendation[] = [];

  // Check unsubmitted attempts first
  const unsubmitted = safeAttempts.find((a) => !a.submitted_at || !a.result);
  if (unsubmitted) {
    recommendations.push({
      title: "Resume unsubmitted paper",
      reason: `You have an active paper on ${unsubmitted.subject} that has not yet been submitted for scoring.`,
      actionLabel: "Resume paper",
      actionHref: `/app/practice/${unsubmitted.id}`,
      priority: "high",
    });
  }

  // Weakest subject recommendation
  const weakSubject = bySubject.find((s) => s.status === "needs_practice" && s.questionsFaced >= 2);
  if (weakSubject) {
    recommendations.push({
      title: `Revise ${weakSubject.subject}`,
      reason: `Accuracy is currently ${weakSubject.accuracyRate}% with ${weakSubject.negativeDeductions} negative penalty marks lost.`,
      actionLabel: "Practice this subject",
      actionHref: `/app/practice?subject=${encodeURIComponent(weakSubject.subject)}`,
      priority: "high",
    });
  }

  // Weakest topic recommendation
  const weakTopic = byTopic.find((t) => t.wrong >= 1 && t.accuracyRate < 60);
  if (weakTopic) {
    recommendations.push({
      title: `Practice ${weakTopic.topic}`,
      reason: `${weakTopic.wrong} error${weakTopic.wrong === 1 ? "" : "s"} recorded in ${weakTopic.subject}. Targeted practice will reinforce this area.`,
      actionLabel: "Practice this topic",
      actionHref: `/app/practice?subject=${encodeURIComponent(weakTopic.subject)}&topic=${encodeURIComponent(weakTopic.topic)}`,
      priority: "medium",
    });
  }

  // NAT recommendation
  const natInfo = byKind.find((k) => k.kind === "NAT");
  if (natInfo && natInfo.total > 0 && natInfo.accuracyRate < 60) {
    recommendations.push({
      title: "Strengthen Numerical Calculations (NAT)",
      reason: `NAT accuracy is at ${natInfo.accuracyRate}%. Precision calculations with zero multiple-choice guidance will improve performance.`,
      actionLabel: "Build NAT paper",
      actionHref: "/app/practice",
      priority: "medium",
    });
  }

  // If no recommendations generated (or zero attempts)
  if (recommendations.length === 0) {
    if (submitted.length === 0) {
      recommendations.push({
        title: "Complete your first practice paper",
        reason: "Sit an authentic GATE paper to generate actionable performance analytics and subject breakdown.",
        actionLabel: "Start practice",
        actionHref: "/app/practice",
        priority: "high",
      });
    } else {
      recommendations.push({
        title: "Sit a comprehensive mixed paper",
        reason: "Maintain readiness by testing across multiple question kinds with authentic GATE negative marking.",
        actionLabel: "New mixed paper",
        actionHref: "/app/practice",
        priority: "medium",
      });
    }
  }

  return {
    overview,
    bySubject,
    byTopic,
    byKind,
    progression,
    hasProgressionTrend: progression.length >= 2,
    patterns,
    recommendations,
  };
}
