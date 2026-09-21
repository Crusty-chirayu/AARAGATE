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
import type { QuestionProvenance } from "./attempts";

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
