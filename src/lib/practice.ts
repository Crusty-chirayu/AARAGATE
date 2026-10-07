/**
 * GATE practice question generation (core MVP priority 4).
 *
 * Pure and deterministic — no Supabase, no network, no clock, no randomness.
 * The provider call itself belongs in an Edge Function; this module owns
 * everything that can be decided without one:
 *
 *   1. the bounded, validated request (`validatePracticeConfig` plus the strict
 *      JSON contract `buildPracticePrompt` hands the model), and
 *   2. the strict parse of whatever comes back (`parsePracticeQuestions`).
 *
 * It deliberately does NOT repair model output. A generated question whose key
 * is missing, whose answer id is not among its options, or whose NAT range is
 * inverted is unusable — quietly coercing one would hand a student a question
 * that cannot be scored correctly. Every entry goes through `validateQuestion`
 * from ./quiz (the same rule book the scoring engine uses) and anything that
 * fails is dropped **with a reason**, never fixed. A second, deterministic
 * layer (./semantics.ts) then proves the facts stated *inside* the question
 * hang together — the worked coding example, arithmetic constraints against
 * the keyed pair, an explanation that names the answer — and every generated
 * question must carry the explanation the review screen will show.
 *
 * WHAT THIS DOES NOT CLAIM. Syntactic and semantic validity prove a question
 * is well-formed and internally consistent, not that its answer is
 * factually correct. Nothing here certifies
 * provenance: questions produced this way are AI-generated practice material,
 * must carry `AI_GENERATED_LABEL`, and must never be presented as official GATE
 * questions or as grounded in a document unless a real document reference was
 * actually supplied.
 */
import { MAX_QUESTION_TEXT, validateQuestion, type Question, type QuestionKind } from "./quiz.ts";
import { verifyQuestionSemantics } from "./semantics.ts";

/** Most questions one request may ask for, so payload and UI stay bounded. */
export const MAX_PRACTICE_QUESTIONS = 25;

/** Longest accepted branch / subject / topic label. */
export const MAX_PRACTICE_LABEL = 120;

export const PRACTICE_DIFFICULTIES = ["easy", "medium", "hard", "mixed"] as const;
export type PracticeDifficulty = (typeof PRACTICE_DIFFICULTIES)[number];

/** The label every generated question carries. Never an official-provenance claim. */
export const AI_GENERATED_LABEL = "AI-generated practice question";

export interface PracticeConfig {
  branch: string;
  subject: string;
  /** Optional within the subject; `null` means "any topic in the subject". */
  topic: string | null;
  difficulty: PracticeDifficulty;
  /** How many of each kind to ask for. At least one entry must be non-zero. */
  counts: Record<QuestionKind, number>;
  /**
   * Set only when the request is genuinely grounded in a document the caller
   * owns. `null` means the questions are not document-backed, and the prompt
   * then forbids citing any source at all.
   */
  sourceDocumentId: string | null;
}

export type PracticeConfigVerdict =
  | { ok: true; config: PracticeConfig }
  | { ok: false; error: string };

const KINDS: readonly QuestionKind[] = ["MCQ", "MSQ", "NAT"];

export function practiceQuestionCounts(
  questions: readonly Question[],
): Record<QuestionKind, number> {
  return questions.reduce(
    (counts, question) => {
      counts[question.kind] += 1;
      return counts;
    },
    { MCQ: 0, MSQ: 0, NAT: 0 },
  );
}

export function questionCountMismatch(
  requested: Record<QuestionKind, number>,
  delivered: Record<QuestionKind, number>,
): string | null {
  const mismatches = KINDS.filter((kind) => requested[kind] !== delivered[kind]).map(
    (kind) => `${kind}: requested ${requested[kind]}, received ${delivered[kind]}`,
  );
  return mismatches.length > 0 ? mismatches.join("; ") : null;
}

/** Narrow to the accepted difficulties, the way quiz.ts narrows question kinds. */
export function isPracticeDifficulty(value: unknown): value is PracticeDifficulty {
  return PRACTICE_DIFFICULTIES.includes(value as PracticeDifficulty);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > MAX_PRACTICE_LABEL) return null;
  return text;
}

/**
 * Bound and normalise a practice request. Deliberately rejects rather than
 * clamping: silently turning "50 questions" into 25 would generate a paper the
 * user did not ask for.
 */
export function validatePracticeConfig(value: unknown): PracticeConfigVerdict {
  const raw = asRecord(value);
  if (!raw) return { ok: false, error: "A practice request must be an object." };

  const branch = cleanLabel(raw.branch);
  if (branch === null) {
    return { ok: false, error: `Branch is required (1–${MAX_PRACTICE_LABEL} characters).` };
  }
  const subject = cleanLabel(raw.subject);
  if (subject === null) {
    return { ok: false, error: `Subject is required (1–${MAX_PRACTICE_LABEL} characters).` };
  }

  let topic: string | null = null;
  if (raw.topic !== null && raw.topic !== undefined) {
    topic = cleanLabel(raw.topic);
    if (topic === null) {
      return { ok: false, error: `Topic must be 1–${MAX_PRACTICE_LABEL} characters when given.` };
    }
  }

  const difficulty = raw.difficulty;
  if (!isPracticeDifficulty(difficulty)) {
    return {
      ok: false,
      error: `Difficulty must be one of ${PRACTICE_DIFFICULTIES.join(", ")}.`,
    };
  }

  const rawCounts = asRecord(raw.counts);
  if (!rawCounts) return { ok: false, error: "Counts must give an MCQ, MSQ and NAT number." };

  const counts: Record<QuestionKind, number> = { MCQ: 0, MSQ: 0, NAT: 0 };
  let total = 0;
  for (const kind of KINDS) {
    const n = rawCounts[kind];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      return { ok: false, error: `${kind} count must be a whole number, 0 or more.` };
    }
    if (n > MAX_PRACTICE_QUESTIONS) {
      return { ok: false, error: `At most ${MAX_PRACTICE_QUESTIONS} questions of one kind.` };
    }
    counts[kind] = n;
    total += n;
  }
  if (total === 0) return { ok: false, error: "Ask for at least one question." };
  if (total > MAX_PRACTICE_QUESTIONS) {
    return { ok: false, error: `At most ${MAX_PRACTICE_QUESTIONS} questions per request.` };
  }

  const sourceDocumentId = raw.sourceDocumentId ?? null;
  if (sourceDocumentId !== null) {
    if (typeof sourceDocumentId !== "string" || !/^[0-9a-f-]{36}$/i.test(sourceDocumentId)) {
      return { ok: false, error: "A source document id must be a UUID, or null." };
    }
  }

  return {
    ok: true,
    config: { branch, subject, topic, difficulty, counts, sourceDocumentId },
  };
}

/**
 * The request handed to the model.
 *
 * Deterministic for a given config, so it is testable and cacheable. The
 * provenance rules are part of the contract, not a footnote: the model is told
 * outright that these are AI-generated practice questions and must not claim
 * official standing or invent citations.
 */
export function buildPracticePrompt(config: PracticeConfig): string {
  const counts = KINDS.filter((kind) => config.counts[kind] > 0)
    .map((kind) => `${config.counts[kind]} × ${kind}`)
    .join(", ");

  return [
    `Write GATE-style practice questions: ${counts}.`,
    `Branch: ${config.branch}`,
    `Subject: ${config.subject}`,
    `Topic: ${config.topic ?? "any topic within the subject"}`,
    `Difficulty: ${config.difficulty}`,
    config.sourceDocumentId
      ? [
          "Ground every question and keyed answer in the source document supplied with this request.",
          "For every question, include source_evidence as an array containing exact, verbatim source quotes that support its keyed answer.",
          "Do not ask about details that are not stated in or directly demonstrated by the source; if the source cannot support enough questions, return fewer.",
        ].join("\n")
      : "Not tied to any source document.",
    "",
    "Rules:",
    "- Every MCQ must have exactly one defensibly correct option; MSQ must include every correct option and no incorrect ones.",
    "- Make wording precise and unambiguous, with distinct distractors and no trick interpretation unless explicitly requested.",
    "- Independently solve every question before replying. Verify the keyed option, every calculation, and the explanation against the stem; never guess or use the key as evidence.",
    "- For mathematical or Boolean questions, simplify/evaluate each option and check for equivalent or multiple-correct options. Ensure all stated results and literal counts are correct.",
    "- For algorithm comparison questions, state implementation assumptions when operation counts can vary; do not ask for a maximum if standard implementations can tie.",
    "- Check complexity choices for overlapping correct answers; worst-case Quick Sort, Bubble Sort, Insertion Sort, and Selection Sort are all O(n^2).",
    '- Use exact complexity guarantees instead of vague claims like "fast access"; distinguish average-case from worst-case behavior.',
    "- For data-structure operation costs, specify details such as insertion position, hashing assumptions, and resizing behavior.",
    "- For factual questions, use established subject knowledge and ensure distractors are not also defensible under the wording.",
    '- Give every option a short id ("A", "B", …). "answer" lists ids from that same question\'s options only.',
    '- "marks" is a positive number, at most 10.',
    `- Keep question and option text under ${MAX_QUESTION_TEXT} characters.`,
    "- Include a brief explanation for every question.",
    "- These are AI-generated practice questions, not official GATE questions. Never claim or imply official provenance.",
    "- Cite a source only if one was supplied above. Never invent references, years, page numbers or question codes.",
    "",
    config.sourceDocumentId
      ? 'Reply with JSON only, no prose and no code fence: {"questions":[{"kind":"MCQ","marks":2,"text":"…","options":[{"id":"A","text":"…"}],"answer":["A"],"explanation":"…","source_evidence":["exact source quote"]}]}'
      : 'Reply with JSON only, no prose and no code fence: {"questions":[{"kind":"MCQ","marks":2,"text":"…","options":[{"id":"A","text":"…"}],"answer":["A"],"explanation":"…"}]}',
  ].join("\n");
}

/**
 * Content identity of a question, for dedupe.
 *
 * Kind + case- and whitespace-normalised text. Two questions that differ only
 * in spacing or capitalisation are the same question, and a repeated question
 * is a repeat however its options were shuffled.
 */
export function questionFingerprint(question: Question): string {
  return `${question.kind}:${question.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export type PracticeFailureReason = "empty_response" | "malformed_json" | "no_valid_questions";

export interface PracticeRejection {
  /** Position of the rejected entry in the model's own list. */
  index: number;
  error: string;
}

export type PracticeParseResult =
  | {
      ok: true;
      questions: Question[];
      /** Entries that failed validation, kept so a caller can surface why. */
      rejected: PracticeRejection[];
      /** Entries dropped as repeats of an earlier question. */
      duplicates: number;
      /** Valid entries dropped because the cap of MAX_PRACTICE_QUESTIONS was reached. */
      truncated: number;
    }
  | { ok: false; reason: PracticeFailureReason; error: string };

/**
 * Pull the first balanced JSON value out of a model reply.
 *
 * Models habitually wrap JSON in a code fence or a sentence of preamble;
 * tolerating that is *transport* tolerance, not content repair — the value that
 * comes out is still validated strictly by `validateQuestion`.
 */
function extractJson(text: string): unknown {
  const start = text.search(/[[{]/);
  if (start < 0) return undefined;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/**
 * Parse and validate a model reply into usable questions.
 *
 * Accepts either a bare array or `{ "questions": [...] }`. Per-entry failures
 * are reported in `rejected` instead of failing the batch — one malformed
 * question must not throw away the rest — but a reply that yields **no** usable
 * question is a failure, not an empty success, so a caller can never mistake a
 * transport or provider problem for "the model chose to return nothing".
 */
export function parsePracticeQuestions(raw: string, sourceText?: string): PracticeParseResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "empty_response", error: "The assistant returned nothing." };
  }

  const payload = extractJson(raw);
  if (payload === undefined) {
    return {
      ok: false,
      reason: "malformed_json",
      error: "The reply was not JSON. No questions were accepted.",
    };
  }

  const list = Array.isArray(payload) ? payload : asRecord(payload)?.questions;
  if (!Array.isArray(list)) {
    // Also covers a provider error body ({"error":"rate_limited"}): it carries
    // no questions array, so it can never be mistaken for generated questions.
    return {
      ok: false,
      reason: "malformed_json",
      error: 'The reply had no "questions" array. No questions were accepted.',
    };
  }

  const questions: Question[] = [];
  const rejected: PracticeRejection[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let truncated = 0;

  list.forEach((entry, index) => {
    const verdict = validateQuestion(entry);
    if (!verdict.ok) {
      rejected.push({ index, error: verdict.error });
      return;
    }
    // AI contract: the review screen must always have an explanation to show.
    // validateQuestion keeps permitting null because the scoring engine does.
    if (!verdict.question.explanation) {
      rejected.push({ index, error: "A generated question must carry an explanation." });
      return;
    }
    if (sourceText !== undefined) {
      const evidenceError = validateSourceEvidence(entry, verdict.question, sourceText);
      if (evidenceError) {
        rejected.push({ index, error: evidenceError });
        return;
      }
    }
    const semantic = verifyQuestionSemantics(verdict.question);
    if (!semantic.ok) {
      rejected.push({ index, error: semantic.error });
      return;
    }
    const fingerprint = questionFingerprint(verdict.question);
    if (seen.has(fingerprint)) {
      duplicates += 1;
      return;
    }
    if (questions.length >= MAX_PRACTICE_QUESTIONS) {
      truncated += 1;
      return;
    }
    seen.add(fingerprint);
    questions.push(verdict.question);
  });

  if (questions.length === 0) {
    return {
      ok: false,
      reason: "no_valid_questions",
      error:
        rejected.length > 0
          ? `None of the ${rejected.length} returned questions were usable.`
          : "The reply contained no questions.",
    };
  }

  return { ok: true, questions, rejected, duplicates, truncated };
}

const GENERIC_EVIDENCE_WORDS = new Set([
  "answer", "code", "document", "option", "provided", "question", "the", "this", "value", "verification",
]);

function evidenceTokens(text: string): Set<string> {
  return new Set(
    (text.match(/[A-Za-z]{3,}|\d+(?:\.\d+)?/g) ?? [])
      .map((token) => token.toLowerCase())
      .filter((token) => !GENERIC_EVIDENCE_WORDS.has(token)),
  );
}

function validateSourceEvidence(
  entry: unknown,
  question: Question,
  sourceText: string,
): string | null {
  const rawEvidence = asRecord(entry)?.source_evidence;
  if (
    !Array.isArray(rawEvidence) ||
    rawEvidence.length === 0 ||
    rawEvidence.length > 3 ||
    rawEvidence.some((quote) => typeof quote !== "string" || quote.trim() === "" || quote.length > 500)
  ) {
    return "A document-grounded question must include up to three exact source_evidence quotes.";
  }

  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
  const quotes = rawEvidence as string[];
  const normalizedSource = normalize(sourceText);
  if (quotes.some((quote) => !normalizedSource.includes(normalize(quote)))) {
    return "A source_evidence quote does not exactly match the selected document.";
  }

  const evidenceWords = evidenceTokens(quotes.join(" "));
  if (question.kind === "NAT") {
    const range = question.nat_range;
    const numbers = quotes.join(" ").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (!range || !numbers.some((value) => value >= range.min && value <= range.max)) {
      return "The document evidence does not support the numeric answer.";
    }
    return null;
  }

  for (const answerId of question.answer ?? []) {
    const answer = question.options.find((option) => option.id === answerId)?.text ?? "";
    const answerWords = [...evidenceTokens(answer)];
    if (answerWords.length === 0 || !answerWords.every((token) => evidenceWords.has(token))) {
      return "The document evidence does not support a keyed answer option.";
    }
  }
  return null;
}

export interface PracticeProvenance {
  /** Fixed discriminator, so a consumer can never read this as official content. */
  source: "ai_generated";
  label: string;
  /** The document these questions were grounded in, or `null` when ungrounded. */
  source_document_id: string | null;
}

/** Provenance to store alongside generated questions. */
export function practiceProvenance(config: PracticeConfig): PracticeProvenance {
  return {
    source: "ai_generated",
    label: AI_GENERATED_LABEL,
    source_document_id: config.sourceDocumentId,
  };
}