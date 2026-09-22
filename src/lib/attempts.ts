/**
 * Attempt assembly and grading (core MVP priorities 5–8).
 *
 * An *attempt* is a practice paper a student actually sat: a frozen snapshot of
 * the questions, their responses, and the score. This module owns everything
 * about that which can be decided without a database or a clock — it is pure,
 * so the demo path, the review screen and the server-scoring contract all read
 * the same arithmetic.
 *
 * Two rules shape the design:
 *
 *  1. **The key must not reach the client before submission.** `PublicAttempt`
 *     is the pre-submission shape and structurally cannot carry `answer`,
 *     `nat_range` or `explanation`. That is why `publicAttempt` exists rather
 *     than an ad-hoc `delete question.answer` at each call site: a type that
 *     cannot hold the key cannot leak it.
 *  2. **A paper is not a score.** `QuizAttempt` is complete before submission —
 *     `result` and `verdicts` are absent until `gradeAttempt` runs. A screen
 *     therefore cannot render "0/0" for a paper nobody has sat.
 *
 * Provenance is carried per question and is a fixed discriminator, so an
 * AI-generated question is never mistaken for an official GATE question.
 */
import {
  UNANSWERED,
  scoreQuestion,
  scoreQuiz,
  type Question,
  type QuizResult,
  type Response,
  type Verdict,
} from "./quiz";
import type { PracticeDifficulty } from "./practice";

/** Where a question actually came from. Never inferred, always recorded. */
export type QuestionProvenance = "ai_generated" | "sample";

export const PROVENANCE_LABEL: Record<QuestionProvenance, string> = {
  ai_generated: "AI-generated",
  sample: "Sample question",
};

/** A question in a paper: the question itself plus where it sits and came from. */
export interface AttemptQuestion extends Question {
  /** Zero-based position in the paper. */
  index: number;
  subject: string;
  topic: string | null;
  difficulty: PracticeDifficulty;
  provenance: QuestionProvenance;
}

/**
 * The question as the client may see it **before** submission.
 *
 * `answer`, `nat_range` and `explanation` are removed by construction. In
 * Supabase mode they are not even fetched, so this is a second line of defence
 * rather than the only one.
 */
export type PublicQuestion = Omit<AttemptQuestion, "answer" | "nat_range" | "explanation">;

/** The part of an attempt that describes the sitting rather than the paper. */
export interface AttemptMeta {
  id: string;
  branch: string;
  subject: string;
  topic: string | null;
  difficulty: PracticeDifficulty;
  /** Set only when the paper was genuinely grounded in an owned document. */
  sourceDocumentId: string | null;
  created_at: string;
  /** Absent until the paper is submitted. */
  submitted_at?: string | null;
}

export interface QuizAttempt extends AttemptMeta {
  questions: AttemptQuestion[];
  /** The responses keyed by question index. Absent until submitted. */
  responses?: Record<number, Response> | null;
  /** The per-question verdicts keyed by question index. Absent until submitted. */
  verdicts?: Record<number, Verdict> | null;
  /** The stored score. Absent until submitted. */
  result?: QuizResult | null;
}

export interface PublicAttempt extends AttemptMeta {
  questions: PublicQuestion[];
}

/** Where a question sits in the paper, and what it is. */
export interface QuestionPosition {
  index: number;
  subject: string;
  topic: string | null;
  difficulty: PracticeDifficulty;
  provenance: QuestionProvenance;
}

/** Attach position and provenance to a validated question. */
export function toAttemptQuestion(question: Question, position: QuestionPosition): AttemptQuestion {
  return { ...question, ...position };
}

/**
 * Strip a question down to what a student may see while still answering it.
 *
 * Built field-by-field rather than by destructuring the key away, so adding a
 * sensitive field to `Question` is a compile error here instead of a silent
 * leak. The same allow-list is mirrored by `get_quiz_attempt()` in
 * `supabase/migrations/20260920000000_quiz_attempts.sql`, which strips
 * `answer`, `nat_range` and `explanation` server-side — the client conversion
 * is the second line of defence, never the only one.
 */
function toPublicQuestion(question: AttemptQuestion): PublicQuestion {
  return {
    index: question.index,
    kind: question.kind,
    marks: question.marks,
    text: question.text,
    options: question.options,
    subject: question.subject,
    topic: question.topic,
    difficulty: question.difficulty,
    provenance: question.provenance,
  };
}

/**
 * The pre-submission view of an attempt: the paper without any key or score.
 */
export function publicAttempt(attempt: QuizAttempt): PublicAttempt {
  return {
    id: attempt.id,
    branch: attempt.branch,
    subject: attempt.subject,
    topic: attempt.topic,
    difficulty: attempt.difficulty,
    sourceDocumentId: attempt.sourceDocumentId,
    created_at: attempt.created_at,
    submitted_at: attempt.submitted_at ?? null,
    questions: attempt.questions.map(toPublicQuestion),
  };
}

/**
 * Line responses up with the paper's question order.
 *
 * The UI stores responses in a sparse map keyed by index; scoring needs a
 * dense list. A missing entry is a skip, which is exactly what `UNANSWERED`
 * means — so a question the student never opened scores 0, not a penalty.
 */
export function orderResponses(
  responses: Readonly<Record<number, Response | undefined>>,
  count: number,
): Response[] {
  const ordered: Response[] = [];
  for (let index = 0; index < count; index += 1) {
    ordered.push(responses[index] ?? UNANSWERED);
  }
  return ordered;
}

/**
 * How many questions the student left untouched.
 *
 * An MSQ whose every option was unticked is the same thing as a skip — the
 * scorer already reads an empty selection that way, so this must agree with it.
 */
export function unansweredCount(responses: readonly Response[]): number {
  return responses.filter(
    (response) =>
      response.kind === "unanswered" ||
      (response.kind === "options" && response.selected.length === 0),
  ).length;
}

/**
 * Score a paper and return it with its responses, verdicts and result attached.
 *
 * Idempotent: the same paper, responses and timestamp always produce the same
 * score, which is what lets the demo path and the server path be compared.
 * `submittedAt` is passed in rather than read from the clock so this stays pure
 * and testable.
 */
export function gradeAttempt(
  attempt: QuizAttempt,
  responses: Readonly<Record<number, Response | undefined>>,
  submittedAt: string,
): { attempt: QuizAttempt; result: QuizResult; verdicts: Record<number, Verdict> } {
  const ordered = orderResponses(responses, attempt.questions.length);

  const verdicts: Record<number, Verdict> = {};
  attempt.questions.forEach((question, index) => {
    verdicts[index] = scoreQuestion(question, ordered[index] ?? UNANSWERED);
  });

  const result = scoreQuiz(attempt.questions, ordered);
  const stored: Record<number, Response> = {};
  ordered.forEach((response, index) => {
    stored[index] = response;
  });

  return {
    attempt: {
      ...attempt,
      submitted_at: submittedAt,
      responses: stored,
      verdicts,
      result,
    },
    result,
    verdicts,
  };
}

/**
 * The dense `Response[]` the demo engine and UI use, keyed by question index —
 * the shape `submit_quiz_attempt` requires (a JSON *object*, not an array).
 */
export function responsesByIndex(
  answers: Readonly<Record<number, Response | undefined>>,
  count: number,
): Record<string, Response> {
  const indexed: Record<string, Response> = {};
  orderResponses(answers, count).forEach((response, index) => {
    indexed[String(index)] = response;
  });
  return indexed;
}

/**
 * Percentage scored, to one decimal.
 *
 * GATE reports negative totals for a badly-attempted paper, so this is not
 * clamped to zero — hiding a negative score would make the review screen lie
 * about the outcome. A paper worth no marks is 0%, not a division by zero.
 */
export function attemptPercentage(result: QuizResult): number {
  if (result.max <= 0) return 0;
  return Math.round((result.awarded / result.max) * 1000) / 10;
}

/** One-line summary of a stored score, for list rows. */
export function attemptScoreLine(result: QuizResult): string {
  const parts = [`${result.correct} correct`];
  if (result.wrong > 0) parts.push(`${result.wrong} wrong`);
  if (result.unanswered > 0) parts.push(`${result.unanswered} skipped`);
  return `${result.awarded} / ${result.max} · ${parts.join(" · ")}`;
}
