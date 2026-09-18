/**
 * GATE-style question bank and quiz scoring (core MVP priorities 5 and 6).
 *
 * Pure and deterministic: no Supabase, no clock, no randomness. The database
 * stores attempts and owns the authoritative server-side scoring; this module
 * is the shared contract those callers use to
 *
 *   1. validate a question before it is stored — including strict validation
 *      of AI-generated practice JSON, where malformed output must be rejected
 *      rather than silently coerced into a wrong-but-plausible key, and
 *   2. compute the per-question verdict the attempt review screen renders.
 *
 * Scoring rules, exactly as specified for the MVP:
 *
 *   | kind | unanswered | correct            | wrong                |
 *   |------|------------|--------------------|----------------------|
 *   | MCQ  | 0          | +marks             | -marks/3 (negative)  |
 *   | MSQ  | 0          | +marks (exact set) | 0 (no negative)      |
 *   | NAT  | 0          | +marks (in range)  | 0 (no negative)      |
 *
 * An unanswered question is always 0, never negative — leaving a question
 * blank must never be worse than answering it wrongly, or the exam's own
 * scoring incentive breaks. MSQ is an exact set match: partial selections
 * score zero, which is GATE's rule, not a full or partial credit scheme.
 * NAT marks correct when the response lands inside an explicit inclusive
 * numeric range, because a typed value rarely reproduces a float exactly.
 *
 * Marks are rounded to two decimals the way GATE reports them, so
 * 2-mark MCQ wrong reads -0.67 rather than -0.6666666666666666.
 */

export type QuestionKind = "MCQ" | "MSQ" | "NAT";

export interface QuestionOption {
  /** Stable option identifier ("A", "B", …) — the answer references this. */
  id: string;
  text: string;
}

/** Inclusive numeric acceptance range for a NAT question. */
export interface NatRange {
  min: number;
  max: number;
}

export interface Question {
  kind: QuestionKind;
  /** Positive award for a correct answer. Also the ceiling of |penalty|/3. */
  marks: number;
  text: string;
  /** Empty for NAT. */
  options: QuestionOption[];
  /**
   * MCQ: exactly one option id. MSQ: one or more option ids.
   * NAT: null — the acceptable answer is `nat_range` instead.
   */
  answer: string[] | null;
  /** Present only for NAT. */
  nat_range: NatRange | null;
  explanation: string | null;
}

/** The largest a single question may be worth, and the most options offered. */
export const MAX_QUESTION_MARKS = 10;
export const MAX_OPTIONS = 8;
export const MAX_QUESTION_TEXT = 2000;

/** GATE's wrong-answer penalty is one third of the question's marks. */
export const MCQ_PENALTY_DIVISOR = 3;

/** Marks are reported to two decimals, as on the official scorecard. */
export function roundMarks(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isQuestionKind(value: unknown): value is QuestionKind {
  return value === "MCQ" || value === "MSQ" || value === "NAT";
}

export type QuestionVerdict =
  | { ok: true; question: Question }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > max) return null;
  return text;
}

function cleanMarks(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > MAX_QUESTION_MARKS) return null;
  return value;
}

function cleanRange(value: unknown): NatRange | null {
  if (!isPlainObject(value)) return null;
  const { min, max } = value;
  if (typeof min !== "number" || typeof max !== "number") return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min > max) return null;
  return { min, max };
}

/**
 * Strictly validate one question, typically straight out of AI-generated
 * practice JSON.
 *
 * Deliberately rejects instead of repairing. A generated question whose key
 * is missing, whose answer id does not exist among its options, or whose NAT
 * range is inverted is *unusable* — quietly accepting it would present a
 * student with a question that cannot be scored correctly. Syntactic
 * validity is all this proves: it does not certify the answer is factually
 * right, and callers must label generated questions as AI-generated.
 */
export function validateQuestion(value: unknown): QuestionVerdict {
  if (!isPlainObject(value)) return { ok: false, error: "Question must be an object." };

  const { kind } = value;
  if (!isQuestionKind(kind)) return { ok: false, error: "Question kind must be MCQ, MSQ or NAT." };

  const marks = cleanMarks(value.marks);
  if (marks === null) {
    return { ok: false, error: `Question marks must be between 0 and ${MAX_QUESTION_MARKS}.` };
  }

  const text = cleanText(value.text, MAX_QUESTION_TEXT);
  if (text === null) {
    return { ok: false, error: `Question text is required (1–${MAX_QUESTION_TEXT} characters).` };
  }

  const explanation =
    value.explanation === null || value.explanation === undefined
      ? null
      : cleanText(value.explanation, MAX_QUESTION_TEXT);

  // NAT carries a numeric acceptance range and no options.
  if (kind === "NAT") {
    const nat_range = cleanRange(value.nat_range);
    if (nat_range === null) {
      return { ok: false, error: "A NAT question needs a numeric range with min <= max." };
    }
    if (value.options !== undefined && value.options !== null) {
      const opts = value.options;
      if (!Array.isArray(opts) || opts.length > 0) {
        return { ok: false, error: "A NAT question must not carry options." };
      }
    }
    return {
      ok: true,
      question: { kind, marks, text, options: [], answer: null, nat_range, explanation },
    };
  }

  // MCQ / MSQ carry options and an answer drawn from them.
  const rawOptions = value.options;
  if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
    return { ok: false, error: "An MCQ or MSQ question needs at least two options." };
  }
  if (rawOptions.length > MAX_OPTIONS) {
    return { ok: false, error: `At most ${MAX_OPTIONS} options are supported.` };
  }

  const options: QuestionOption[] = [];
  const seen = new Set<string>();
  for (const raw of rawOptions) {
    if (!isPlainObject(raw)) return { ok: false, error: "Each option must be an object." };
    const id = cleanText(raw.id, 16);
    if (id === null) return { ok: false, error: "Each option needs a short id." };
    if (seen.has(id)) return { ok: false, error: `Duplicate option id "${id}".` };
    seen.add(id);
    const optionText = cleanText(raw.text, MAX_QUESTION_TEXT);
    if (optionText === null) return { ok: false, error: `Option "${id}" needs text.` };
    options.push({ id, text: optionText });
  }

  const rawAnswer = value.answer;
  if (!Array.isArray(rawAnswer) || rawAnswer.length === 0) {
    return { ok: false, error: "An MCQ or MSQ question needs at least one answer id." };
  }
  const answer: string[] = [];
  for (const id of rawAnswer) {
    if (typeof id !== "string" || !seen.has(id)) {
      return { ok: false, error: "Every answer id must match one of the question's options." };
    }
    if (!answer.includes(id)) answer.push(id);
  }
  if (kind === "MCQ" && answer.length !== 1) {
    return { ok: false, error: "An MCQ question must have exactly one answer." };
  }

  return {
    ok: true,
    question: { kind, marks, text, options, answer, nat_range: null, explanation },
  };
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/** A student's response to one question. */
export type Response =
  | { kind: "unanswered" }
  | { kind: "options"; selected: string[] }
  | { kind: "numeric"; value: number };

export type Outcome = "correct" | "wrong" | "unanswered";

export interface Verdict {
  outcome: Outcome;
  /** Marks awarded for this question. Negative only for a wrong MCQ. */
  awarded: number;
  /** The question's full marks, for "% scored" display. */
  max: number;
}

export const UNANSWERED: Response = { kind: "unanswered" };

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * Score one response against one question.
 *
 * Returns a verdict rather than a bare number so the review screen can show
 * *why* marks were lost (correct / wrong / skipped) without re-deriving it.
 */
export function scoreQuestion(question: Question, response: Response): Verdict {
  const max = question.marks;

  if (response.kind === "unanswered") {
    return { outcome: "unanswered", awarded: 0, max };
  }

  // A numeric response to an option question (or vice versa) is a caller bug,
  // not a wrong answer — treat it as unanswered rather than inventing a
  // penalty for input the student could not have produced.
  if (question.kind === "NAT" && response.kind !== "numeric") {
    return { outcome: "unanswered", awarded: 0, max };
  }
  if (question.kind !== "NAT" && response.kind !== "options") {
    return { outcome: "unanswered", awarded: 0, max };
  }

  if (question.kind === "NAT") {
    const value = (response as { kind: "numeric"; value: number }).value;
    if (!Number.isFinite(value) || question.nat_range === null) {
      return { outcome: "wrong", awarded: 0, max };
    }
    const { min, max: hi } = question.nat_range;
    const correct = value >= min && value <= hi;
    return { outcome: correct ? "correct" : "wrong", awarded: correct ? max : 0, max };
  }

  const selected = (response as { kind: "options"; selected: string[] }).selected;
  const key = question.answer ?? [];
  // Nothing ticked is a skip, not a wrong answer — it must not be penalised.
  if (selected.length === 0) {
    return { outcome: "unanswered", awarded: 0, max };
  }

  if (question.kind === "MSQ") {
    // Exact set match; no partial credit and no negative marking.
    const correct = sameSet(selected, key);
    return { outcome: correct ? "correct" : "wrong", awarded: correct ? max : 0, max };
  }

  // MCQ: exactly one key id. Extra or unknown selections are simply wrong.
  const correct = selected.length === 1 && key.includes(selected[0]);
  if (correct) return { outcome: "correct", awarded: max, max };
  return { outcome: "wrong", awarded: roundMarks(-max / MCQ_PENALTY_DIVISOR), max };
}

export interface QuizResult {
  /** Sum of awarded marks; may be negative. */
  awarded: number;
  /** Sum of the questions' full marks. */
  max: number;
  correct: number;
  wrong: number;
  unanswered: number;
}

/**
 * Score a whole attempt.
 *
 * `questions[i]` pairs with `responses[i]`. A missing response is treated as
 * unanswered. Scoring is idempotent — the same inputs always give the same
 * result, which is what lets the server and the review UI agree.
 */
export function scoreQuiz(questions: readonly Question[], responses: readonly Response[]): QuizResult {
  let awarded = 0;
  let max = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  questions.forEach((question, i) => {
    const verdict = scoreQuestion(question, responses[i] ?? UNANSWERED);
    awarded += verdict.awarded;
    max += verdict.max;
    if (verdict.outcome === "correct") correct += 1;
    else if (verdict.outcome === "wrong") wrong += 1;
    else unanswered += 1;
  });

  return { awarded: roundMarks(awarded), max: roundMarks(max), correct, wrong, unanswered };
}

/** Signed display form: "+4", "0", "-0.67". */
export function formatMarks(value: number): string {
  const rounded = roundMarks(value);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}