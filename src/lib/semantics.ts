/**
 * Deterministic semantic verification for AI-generated practice questions.
 *
 * `validateQuestion` (./quiz.ts) proves a question is well-formed and
 * scorable; nothing there checks that the facts *stated inside it* hold
 * together. This module is the second gate: mechanical, offline checks a
 * reader could reproduce with pen and paper — a letter-position cipher's
 * worked example, an arithmetic constraint against the keyed pair, an
 * explanation that names the answer it claims to justify. Each check runs on
 * the pure Question shape, so the client parse and the edge function share
 * one rule book without touching the provider layer.
 *
 * SOUNDNESS CONTRACT — read before adding a check:
 *   Reject only on a *provable* contradiction. When a pattern cannot be
 *   parsed with confidence the check passes the question through untouched;
 *   dropping a valid question would be a worse defect than letting an
 *   unverifiable-but-plausible one through, because the structural layer has
 *   already guaranteed the question is well-formed, unique and scorable.
 *   Every reason string below is a self-contained sentence a rejection log
 *   can carry verbatim.
 *
 * Out of scope: factual correctness of prose, source-document grounding, and
 * questions unsolved-by-design (proofs, "discuss" prompts). Generated
 * questions still carry `AI_GENERATED_LABEL`.
 */
import type { Question } from "./quiz.ts";

export type SemanticVerdict = { ok: true } | { ok: false; error: string };

const OK: SemanticVerdict = { ok: true };
const fail = (error: string): SemanticVerdict => ({ ok: false, error });

/* -------------------------------------------------------------------------- */
/* Coding transforms                                                          */
/* -------------------------------------------------------------------------- */

interface CodePair {
  word: string;
  code: string;
}

/** "CAT is coded as 3120", "'CAT' is coded as '3120'". */
const CODED_AS = /\b([A-Z]{2,8})\b['"]?\s+(?:is\s+)?coded\s+as\s+['"]?(\d{1,12})\b/g;
/** "CAT → 3120", "CAT->3120", "CAT => 3120". */
const CODE_ARROW = /\b([A-Z]{2,8})\b\s*(?:→|->|=>)\s*['"]?(\d{1,12})\b/g;

/** Words the text asks the reader to code, phrased as a question. */
const TARGET_PATTERNS: RegExp[] = [
  /\b(?:what|how)\s+(?:will|would|does|do)\s+['"]?([A-Z]{2,8})['"]?\b/g,
  /\b(?:code|codes)\s+for\s+['"]?([A-Z]{2,8})['"]?\b/g,
  /['"]?([A-Z]{2,8})['"]?\s+be\s+coded/g,
  // "what is DOG?" / "how is DOG coded?" â€” the is/are phrasing, anchored to a
  // question mark or a coding verb so an all-caps word in an unrelated
  // conceptual follow-up ("What is THE time complexity?") is not read as a query.
  /\b(?:what|how)\s+(?:is|are)\s+['"]?([A-Z]{2,8})['"]?\s*(?:\?|coded\b|code\b)/g,
];

/** The only rules this module can verify: concatenated alphabetical positions. */
const CODING_RULES: { code: (word: string) => string }[] = [
  { code: (word) => [...word].map((ch) => String(ch.charCodeAt(0) - 64)).join("") }, // A=1 … Z=26
  { code: (word) => [...word].map((ch) => String(ch.charCodeAt(0) - 65)).join("") }, // A=0 … Z=25
];

/** An option that means "no such code exists". */
const NONE_CLAIM =
  /none\s+of\s+(?:these|the|above|it)|not\s+given|cannot\s+be\s+determined|can'?t\s+be\s+determined|no\s+such\s+(?:code|value)/i;

function statedPairs(text: string): CodePair[] {
  const pairs: CodePair[] = [];
  for (const pattern of [CODED_AS, CODE_ARROW]) {
    for (const match of text.matchAll(pattern)) {
      pairs.push({ word: match[1], code: match[2] });
    }
  }
  return pairs;
}

/** The single word the question asks to code, or several (→ skip). */
function codingTargets(text: string, pairWords: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  for (const pattern of TARGET_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (!pairWords.has(match[1])) found.add(match[1]);
    }
  }
  return [...found];
}

/** Digit runs of an option, commas stripped, compared by exact equality. */
function digitRuns(text: string): string[] {
  return text.replace(/,/g, "").match(/\d+/g) ?? [];
}

/**
 * If the text states coding examples that match a letter-position rule,
 * every stated pair must follow that one rule, and the keyed answer (or NAT
 * range) must contain the rule's code for the queried word.
 *
 * A cipher no rule explains (reversal, substitution) passes through
 * unverified; only a pair that matches one rule while another pair
 * contradicts it is provably inconsistent.
 */
function checkCoding(question: Question): SemanticVerdict {
  const pairs = statedPairs(question.text);
  if (pairs.length === 0) return OK;

  const rule = CODING_RULES.find((candidate) =>
    pairs.every((pair) => candidate.code(pair.word) === pair.code),
  );
  if (!rule) {
    const partiallyExplained = CODING_RULES.some((candidate) =>
      pairs.some((pair) => candidate.code(pair.word) === pair.code),
    );
    return partiallyExplained
      ? fail("The coding examples stated in the question are not consistent with a single rule.")
      : OK;
  }

  const targets = codingTargets(question.text, new Set(pairs.map((pair) => pair.word)));
  if (targets.length !== 1) return OK; // no query, or several queries — verified as far as possible
  const expected = rule.code(targets[0]);

  if (question.kind === "NAT") {
    const range = question.nat_range;
    if (!range) return OK;
    const value = Number(expected);
    return value >= range.min && value <= range.max
      ? OK
      : fail(`The coding rule gives ${expected}, which is outside the accepted range.`);
  }

  const key = question.answer ?? [];
  const keyedMatches = question.options.some(
    (option) => key.includes(option.id) && digitRuns(option.text).includes(expected),
  );
  if (keyedMatches) return OK;
  const anyOptionMatches = question.options.some((option) => digitRuns(option.text).includes(expected));
  const keyIsNoneClaim = question.options.some(
    (option) => key.includes(option.id) && NONE_CLAIM.test(option.text),
  );
  if (!anyOptionMatches && keyIsNoneClaim) return OK;
  return fail(`The keyed answer does not follow the coding rule (expected ${expected}).`);
}

/* -------------------------------------------------------------------------- */
/* Arithmetic constraints                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Skips the check when the question inverts the target ("cannot", "except",
 * …): a negated constraint makes satisfaction the wrong thing to test, and
 * guessing at polarity risks rejecting a correct question.
 */
const NEGATION =
  /\b(?:not|cannot|can'?t|don'?t|except|impossible|incorrect|wrong|false|never|none)\b/i;

/** Ordering cues ("the larger number first") that collapse two satisfying pairs into one ordered answer. */
const ORDERING =
  /\b(?:larger|smaller|greater|lesser|ascending|descending|first number|second number|in that order|respectively)\b/i;

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const DIFFERENCE_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bdiffer(?:s|ed)?\s+by\s+(${NUMBER})`, "i"),
  new RegExp(String.raw`\bdifference\s+(?:of\s+)?(${NUMBER})`, "i"),
  new RegExp(String.raw`\bdifference\b(?:\s+\w+){0,6}?\s+is\s+(${NUMBER})`, "i"),
];
const PRODUCT_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bproduct\b(?:\s+\w+){0,6}?\s+(?:is|=)\s*(${NUMBER})`, "i"),
  new RegExp(String.raw`\bproduct\s+(${NUMBER})`, "i"),
];
const SUM_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bsum\b(?:\s+\w+){0,6}?\s+(?:is|=)\s*(${NUMBER})`, "i"),
];

interface Constraint {
  label: string;
  holds: (a: number, b: number) => boolean;
}

/** Float-safe equality with relative tolerance — 16×6=96 never passes for 240. */
const near = (actual: number, expected: number): boolean =>
  Math.abs(actual - expected) <= 1e-6 * Math.max(1, Math.abs(expected));

function firstValue(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
}

/** Parse the numeric constraints the question states, if it states any. */
function constraintsOf(text: string): Constraint[] {
  const out: Constraint[] = [];
  const difference = firstValue(text, DIFFERENCE_PATTERNS);
  if (difference !== null) {
    out.push({
      label: `difference of ${difference}`,
      holds: (a, b) => near(Math.abs(a - b), difference),
    });
  }
  const product = firstValue(text, PRODUCT_PATTERNS);
  if (product !== null) {
    out.push({ label: `product of ${product}`, holds: (a, b) => near(a * b, product) });
  }
  const sum = firstValue(text, SUM_PATTERNS);
  if (sum !== null) {
    out.push({ label: `sum of ${sum}`, holds: (a, b) => near(a + b, sum) });
  }
  return out;
}

/** An option phrased as a pair of numbers: "16 and 6", "(16, 6)", "1,200 and 300". */
function numericPair(text: string): [number, number] | null {
  const numbers = text.replace(/,/g, "").match(new RegExp(NUMBER, "g"));
  return numbers && numbers.length === 2 ? [Number(numbers[0]), Number(numbers[1])] : null;
}

/**
 * For an MCQ whose every option is a numeric pair, the keyed pair must
 * satisfy every parsed constraint — this is what catches the observed
 * "differ by 10, product 240" question whose key "16 and 6" multiplies to 96.
 *
 * With at least two independent constraints the system is pinned down enough
 * that two simultaneously-satisfying options would be two correct answers,
 * rejected too — but only when no ordering cue collapses them into one
 * answer. A single constraint is never judged ambiguous: an unparsed clause
 * ("both are prime") may still disambiguate.
 */
function checkArithmetic(question: Question): SemanticVerdict {
  if (question.kind !== "MCQ") return OK;
  if (NEGATION.test(question.text)) return OK;

  const constraints = constraintsOf(question.text);
  if (constraints.length === 0) return OK;

  const pairs = question.options.map((option) => numericPair(option.text));
  if (pairs.some((pair) => pair === null)) return OK; // not an all-pairs question

  const keyId = (question.answer ?? [])[0];
  const keyIndex = question.options.findIndex((option) => option.id === keyId);
  const keyPair = keyIndex >= 0 ? pairs[keyIndex] : null;
  if (!keyPair) return OK;

  const violated = constraints.find((constraint) => !constraint.holds(keyPair[0], keyPair[1]));
  if (violated) {
    return fail(`The keyed answer does not satisfy the stated ${violated.label}.`);
  }

  if (constraints.length >= 2 && !ORDERING.test(question.text)) {
    const satisfied = pairs.filter(
      (pair) => pair !== null && constraints.every((constraint) => constraint.holds(pair[0], pair[1])),
    );
    if (satisfied.length > 1) {
      return fail(
        "More than one option satisfies the stated conditions, so the question has no single correct answer.",
      );
    }
  }
  return OK;
}

/* -------------------------------------------------------------------------- */
/* Answer ↔ explanation consistency                                           */
/* -------------------------------------------------------------------------- */

/**
 * Positive, single-letter answer claims. Case-sensitive by design: option ids
 * are uppercase, so "answer is B" claims option B while the lowercase "b" in
 * prose never does. A letter must stand alone — "C++" and "LRU" are not
 * claims about options C or L — and every pattern requires an explicit
 * "correct / answer is …" formulation, so "Option B is incorrect" never
 * counts as a claim for B.
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\b(?:the\s+)?correct\s+(?:answer|option|choice)\s*(?:is|=|:)\s*(?:option\s*)?\(?([A-H])(?![A-Za-z+])/g,
  /\boption\s*\(?([A-H])(?![A-Za-z+])\)?\s*(?:is|=|:)\s*(?:the\s+)?correct\b/g,
  /\banswer\s*(?:is|=|:)\s*(?:option\s*)?\(?([A-H])(?![A-Za-z+])\)?/g,
  /\b([A-H])\s+is\s+(?:the\s+)?correct\b/g,
];
/** "The correct options are A and C." — letters harvested from the claim span. */
const SPAN_CLAIM = /\b(?:correct\s+)?(?:answers|options|choices)\s+(?:are|=|:)\s+([^.;]+)/gi;
/** Standalone uppercase A–H inside a claim span (never inside C++, LRU, …). */
const LETTER_IN_SPAN = /(?:^|[^A-Za-z+])([A-H])(?![A-Za-z+])/g;
/** "The answer is 12." / "answer = 4157" for NAT. Requires the word "answer". */
const NAT_ANSWER_CLAIM =
  /\b(?:the\s+)?(?:correct\s+)?(?:final\s+)?answer\s*(?:is|=|:)\s*(-?\d+(?:\.\d+)?)/gi;

/**
 * An explanation that explicitly names the answer must name *the* answer:
 * a letter claim outside the key, or a numeric claim outside the NAT range,
 * is a contradiction the review screen would render as self-disagreeing.
 * An absent or unparseable explanation passes — presence itself is enforced
 * by the practice parser, not here.
 */
function checkExplanation(question: Question): SemanticVerdict {
  const explanation = question.explanation;
  if (!explanation) return OK;

  if (question.kind === "NAT") {
    const range = question.nat_range;
    if (!range) return OK;
    for (const match of explanation.matchAll(NAT_ANSWER_CLAIM)) {
      const value = Number(match[1]);
      if (value < range.min || value > range.max) {
        return fail(
          `The explanation states the answer is ${match[1]}, which is outside the accepted range.`,
        );
      }
    }
    return OK;
  }

  const optionIds = new Set(question.options.map((option) => option.id));
  const key = new Set(question.answer ?? []);
  const claims = new Set<string>();
  for (const pattern of CLAIM_PATTERNS) {
    for (const match of explanation.matchAll(pattern)) claims.add(match[1]);
  }
  for (const match of explanation.matchAll(SPAN_CLAIM)) {
    for (const letter of match[1].matchAll(LETTER_IN_SPAN)) claims.add(letter[1]);
  }
  for (const claim of claims) {
    // Claims that name no option id of this question contradict nothing here.
    if (optionIds.has(claim) && !key.has(claim)) {
      return fail(
        `The explanation names option ${claim} as the answer, which is not the keyed answer.`,
      );
    }
  }
  return OK;
}

/* -------------------------------------------------------------------------- */

/**
 * Run every semantic check; the first provable contradiction wins.
 * Order matters only for which reason a rejection reports, never for whether
 * one is made.
 */
export function verifyQuestionSemantics(question: Question): SemanticVerdict {
  for (const check of [checkCoding, checkArithmetic, checkExplanation]) {
    const verdict = check(question);
    if (!verdict.ok) return verdict;
  }
  return OK;
}