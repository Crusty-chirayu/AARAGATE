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

function checkSortingComparisonQuestion(question: Question): SemanticVerdict {
  if (
    question.kind !== "MCQ" ||
    !/\b(?:maximum|most|greatest)\s+(?:number\s+of\s+)?comparisons\b/i.test(question.text) ||
    !/\barray\b/i.test(question.text)
  ) {
    return OK;
  }
  const namedAlgorithms = question.options.filter((option) =>
    /\b(?:bubble|selection|insertion|merge|quick|heap)\s+sort\b/i.test(option.text),
  );
  return namedAlgorithms.length > 1
    ? fail(
        "A fixed-array comparison-count question needs explicit algorithm implementations to have one verifiable maximum.",
      )
    : OK;
}

function checkQuadraticSortingOptions(question: Question): SemanticVerdict {
  if (
    question.kind !== "MCQ" ||
    !/\bworst[- ]case\b/i.test(question.text) ||
    !/O\s*\(\s*n\s*(?:\^|²)\s*2\s*\)/i.test(question.text)
  ) {
    return OK;
  }
  const quadraticSorts = question.options.filter((option) =>
    /\b(?:bubble|selection|insertion|quick)\s+sort\b/i.test(option.text),
  );
  return quadraticSorts.length > 1
    ? fail("More than one listed sorting algorithm has the stated worst-case O(n²) complexity.")
    : OK;
}

function checkAmbiguousMinMaxAccess(question: Question): SemanticVerdict {
  if (
    question.kind !== "MCQ" ||
    !/\b(?:fast|quick)\s+access\b/i.test(question.text) ||
    !/\bminimum\b/i.test(question.text) ||
    !/\bmaximum\b/i.test(question.text)
  ) {
    return OK;
  }
  const candidates = question.options.filter((option) =>
    /\b(?:binary search tree|red[- ]black tree|heap)\b/i.test(option.text),
  );
  return candidates.length > 1
    ? fail("A min/max access question must state exact complexity guarantees to distinguish the options.")
    : OK;
}

function checkAmbiguousInsertionComplexity(question: Question): SemanticVerdict {
  if (
    question.kind !== "MCQ" ||
    !/\binsert(?:ion|ing)?\b/i.test(question.text)
  ) {
    return OK;
  }
  if (
    /\bunsorted array\b/i.test(question.text) &&
    !/\b(?:append|end of (?:the )?array|specific position|at index|given location)\b/i.test(
      question.text,
    )
  ) {
    return fail("Array insertion complexity depends on the insertion position, which the question does not specify.");
  }
  if (!/O\s*\(\s*1\s*\)/i.test(question.text)) return OK;
  const candidates = question.options.filter((option) =>
    /\b(?:array list|singly linked list|hash table)\b/i.test(option.text),
  );
  return candidates.length > 1
    ? fail("An O(1) insertion question must specify the data-structure operation and assumptions.")
    : OK;
}

function checkUnqualifiedBstComplexity(question: Question): SemanticVerdict {
  if (
    question.kind !== "MCQ" ||
    !/\b(?:binary search tree|BST)\b/i.test(question.text) ||
    !/\b(?:minimum|maximum|search|find|access)\b/i.test(question.text) ||
    /\b(?:worst|average)[- ]case\b|\bbalanced\b/i.test(question.text)
  ) {
    return OK;
  }
  const optionsText = question.options.map((option) => option.text).join(" ");
  return /O\s*\(\s*n\s*\)/i.test(optionsText) && /O\s*\(\s*log\s*n\s*\)/i.test(optionsText)
    ? fail("A BST complexity question must specify balancing or the average/worst case.")
    : OK;
}

type BooleanExpression =
  | { kind: "constant"; value: boolean }
  | { kind: "variable"; name: string }
  | { kind: "not"; value: BooleanExpression }
  | { kind: "and" | "or"; left: BooleanExpression; right: BooleanExpression };

function parseBooleanExpression(text: string): BooleanExpression | null {
  const normalized = text
    .replace(/\\(?:left|right)\b/g, "")
    .replace(/\\(?:cdot|times|land|wedge)\b/g, ".")
    .replace(/\\(?:lor|vee)\b/g, "+")
    .replace(/\\neg\b/g, "!")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\bAND\b/gi, ".")
    .replace(/\bOR\b/gi, "+")
    .replace(/\bNOT\b/gi, "!");
  const tokens: string[] = [];
  let offset = 0;
  const tokenPattern = /[A-Z]|[01]|[()+.*&|~!'\u2032\u2019·]/gy;
  while (offset < normalized.length) {
    if (/\s/.test(normalized[offset])) {
      offset += 1;
      continue;
    }
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(normalized);
    if (!match) return null;
    tokens.push(match[0]);
    offset = tokenPattern.lastIndex;
  }
  if (tokens.length === 0) return null;

  let cursor = 0;
  const peek = () => tokens[cursor];
  const parseOr = (): BooleanExpression | null => {
    let left = parseAnd();
    while (left && (peek() === "+" || peek() === "|")) {
      cursor += 1;
      const right = parseAnd();
      if (!right) return null;
      left = { kind: "or", left, right };
    }
    return left;
  };
  const startsUnary = (token: string | undefined) =>
    token !== undefined && (/^[A-Z01(]$/.test(token) || token === "!" || token === "~");
  const parseAnd = (): BooleanExpression | null => {
    let left = parseUnary();
    while (left && ([".", "*", "&", "·"].includes(peek()) || startsUnary(peek()))) {
      if ([".", "*", "&", "·"].includes(peek())) cursor += 1;
      const right = parseUnary();
      if (!right) return null;
      left = { kind: "and", left, right };
    }
    return left;
  };
  const parseUnary = (): BooleanExpression | null => {
    if (peek() === "!" || peek() === "~") {
      cursor += 1;
      const value = parseUnary();
      return value ? { kind: "not", value } : null;
    }
    let value: BooleanExpression | null;
    if (peek() === "(") {
      cursor += 1;
      value = parseOr();
      if (!value || peek() !== ")") return null;
      cursor += 1;
    } else {
      const token = peek();
      if (token === "0" || token === "1") {
        value = { kind: "constant", value: token === "1" };
        cursor += 1;
      } else if (token && /^[A-Z]$/.test(token)) {
        value = { kind: "variable", name: token };
        cursor += 1;
      } else {
        return null;
      }
    }
    while (peek() === "'" || peek() === "\u2032" || peek() === "\u2019") {
      cursor += 1;
      value = { kind: "not", value };
    }
    return value;
  };

  const expression = parseOr();
  return expression && cursor === tokens.length ? expression : null;
}

function booleanVariables(expression: BooleanExpression, found = new Set<string>()): string[] {
  if (expression.kind === "variable") found.add(expression.name);
  else if (expression.kind === "not") booleanVariables(expression.value, found);
  else if (expression.kind === "and" || expression.kind === "or") {
    booleanVariables(expression.left, found);
    booleanVariables(expression.right, found);
  }
  return [...found].sort();
}

function evaluateBoolean(
  expression: BooleanExpression,
  values: Readonly<Record<string, boolean>>,
): boolean {
  switch (expression.kind) {
    case "constant":
      return expression.value;
    case "variable":
      return values[expression.name];
    case "not":
      return !evaluateBoolean(expression.value, values);
    case "and":
      return evaluateBoolean(expression.left, values) && evaluateBoolean(expression.right, values);
    case "or":
      return evaluateBoolean(expression.left, values) || evaluateBoolean(expression.right, values);
  }
}

type TruthTable = {
  expression: BooleanExpression | null;
  variables: string[];
  values: boolean[];
};

function truthTable(expression: BooleanExpression): TruthTable | null {
  const variables = booleanVariables(expression);
  if (variables.length > 8) return null;
  const values = Array.from({ length: 2 ** variables.length }, (_, row) => {
    const assignment = Object.fromEntries(
      variables.map((name, bit) => [name, Boolean(row & (1 << bit))]),
    );
    return evaluateBoolean(expression, assignment);
  });
  return { expression, variables, values };
}

function sameTruthTable(left: TruthTable | null, right: TruthTable | null): boolean {
  if (!left || !right || !left.expression || !right.expression) return false;
  const leftExpression = left.expression;
  const rightExpression = right.expression;
  const variables = [...new Set([...left.variables, ...right.variables])].sort();
  if (variables.length > 8) return false;
  return Array.from({ length: 2 ** variables.length }, (_, row) => {
    const assignment = Object.fromEntries(
      variables.map((name, bit) => [name, Boolean(row & (1 << bit))]),
    );
    return evaluateBoolean(leftExpression, assignment) ===
      evaluateBoolean(rightExpression, assignment);
  }).every(Boolean);
}

function parseBooleanRelation(text: string): TruthTable | null {
  const parts = text.split("=");
  if (parts.length !== 2) return null;
  const left = parseBooleanExpression(parts[0]);
  const right = parseBooleanExpression(parts[1]);
  if (!left || !right) return null;
  const variables = [...new Set([...booleanVariables(left), ...booleanVariables(right)])].sort();
  if (variables.length > 8) return null;
  return {
    expression: null,
    variables,
    values: Array.from({ length: 2 ** variables.length }, (_, row) => {
      const assignment = Object.fromEntries(
        variables.map((name, bit) => [name, Boolean(row & (1 << bit))]),
      );
      return evaluateBoolean(left, assignment) === evaluateBoolean(right, assignment);
    }),
  };
}

function isTautology(table: TruthTable | null): boolean {
  return table !== null && table.values.every(Boolean);
}

function optionBooleanValue(
  text: string,
  assignments?: Readonly<Record<string, boolean>>,
): boolean | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  const number = optionNumber(text);
  if (number === 0 || number === 1) return number === 1;
  const expression = parseBooleanExpression(text);
  if (
    expression &&
    assignments &&
    booleanVariables(expression).every((name) => Object.hasOwn(assignments, name))
  ) {
    return evaluateBoolean(expression, assignments);
  }
  const table = expression ? truthTable(expression) : null;
  if (!table || table.variables.length > 0) return null;
  return table.values[0];
}

function checkCanonicalMintermQuestion(question: Question): SemanticVerdict {
  if (question.kind !== "MCQ" || !/\bcanonical\s+(?:sum of products|SOP)\b/i.test(question.text)) {
    return OK;
  }
  const functionMatch = question.text.match(
    /\b(\d+)-variable function\s+([A-Z](?:\s*,\s*[A-Z]){1,7})\b/i,
  );
  const mintermMatch = question.text.match(/\btrue\s+for\s+minterms?\s+([\d,\sand]+)/i);
  if (!functionMatch || !mintermMatch) return OK;

  const variableCount = Number(functionMatch[1]);
  const variables = functionMatch[2].split(",").map((name) => name.trim().toUpperCase());
  const minterms = new Set(mintermMatch[1].match(/\d+/g)?.map(Number) ?? []);
  if (
    variableCount !== variables.length ||
    variableCount > 8 ||
    minterms.size === 0 ||
    [...minterms].some((minterm) => minterm >= 2 ** variableCount)
  ) {
    return fail("The canonical SOP question has invalid variable or minterm data.");
  }

  const expressions = question.options.map((option) => parseBooleanExpression(option.text));
  if (expressions.some((expression) => expression === null)) return OK;
  const matches = expressions.flatMap((expression, optionIndex) => {
    const agrees = Array.from({ length: 2 ** variableCount }, (_, minterm) => {
      const assignment = Object.fromEntries(
        variables.map((name, index) => [
          name,
          Boolean(minterm & (1 << (variableCount - index - 1))),
        ]),
      );
      return evaluateBoolean(expression!, assignment) === minterms.has(minterm);
    }).every(Boolean);
    return agrees ? [optionIndex] : [];
  });
  if (matches.length !== 1) {
    return fail("The options do not contain exactly one expression for the stated minterms.");
  }
  const keyIndex = question.options.findIndex((option) => option.id === question.answer?.[0]);
  if (matches[0] !== keyIndex) {
    return fail("The keyed answer does not match the function defined by the stated minterms.");
  }
  return OK;
}

function extractBooleanDefinition(text: string): string | null {
  const proseDefinition = text.match(
    /\bBoolean\s+expression\s*:\s*([\s\S]*?)\s+which\b/i,
  )?.[1];
  const trailingExpression = text.match(
    /\bBoolean\s+expression\s*:?\s+([\s\S]+?)\??\s*$/,
  )?.[1];
  const functionDefinition = text.match(
    /\bF\s*\([^)]*\)\s*=\s*([A-Z01'’().+*&·\s]+)/,
  )?.[1];
  const namedExpression = text.match(
    /\b(?:value|result|output)\b[\s\S]*?\bexpression\s+([\s\S]*?)(?:\?|$)/i,
  )?.[1];
  const delimitedExpression = text.match(/\\\(([\s\S]*?)\\\)/)?.[1];
  const candidate =
    proseDefinition ?? delimitedExpression ?? functionDefinition ?? namedExpression ?? trailingExpression;
  if (!candidate) return null;
  return candidate.trim().replace(/[?.!]+$/, "").trim();
}

function dualBooleanExpression(expression: BooleanExpression): BooleanExpression {
  if (expression.kind === "and" || expression.kind === "or") {
    return {
      kind: expression.kind === "and" ? "or" : "and",
      left: dualBooleanExpression(expression.left),
      right: dualBooleanExpression(expression.right),
    };
  }
  if (expression.kind === "not") {
    return { kind: "not", value: dualBooleanExpression(expression.value) };
  }
  return expression;
}

function numericValue(text: string): number | null {
  const tokens: string[] = [];
  let offset = 0;
  const tokenPattern = /\d+(?:\.\d+)?|[()+\-*/^%×÷]/gy;
  while (offset < text.length) {
    if (/\s/.test(text[offset])) {
      offset += 1;
      continue;
    }
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(text);
    if (!match) return null;
    tokens.push(match[0]);
    offset = tokenPattern.lastIndex;
  }
  if (tokens.length === 0) return null;

  let cursor = 0;
  const parseSum = (): number | null => {
    let value = parseProduct();
    while (value !== null && (tokens[cursor] === "+" || tokens[cursor] === "-")) {
      const operator = tokens[cursor++];
      const right = parseProduct();
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const parseProduct = (): number | null => {
    let value = parsePower();
    while (value !== null && ["*", "/", "×", "÷"].includes(tokens[cursor])) {
      const operator = tokens[cursor++];
      const right = parsePower();
      if (right === null || ((operator === "/" || operator === "÷") && right === 0)) return null;
      value = operator === "*" || operator === "×" ? value * right : value / right;
    }
    return value;
  };
  const parsePower = (): number | null => {
    const left = parseUnary();
    if (left === null || tokens[cursor] !== "^") return left;
    cursor += 1;
    const right = parsePower();
    return right === null ? null : left ** right;
  };
  const parseUnary = (): number | null => {
    if (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const negative = tokens[cursor++] === "-";
      const value = parseUnary();
      return value === null ? null : negative ? -value : value;
    }
    let value: number | null;
    if (tokens[cursor] === "(") {
      cursor += 1;
      value = parseSum();
      if (value === null || tokens[cursor++] !== ")") return null;
    } else if (/^\d/.test(tokens[cursor] ?? "")) {
      value = Number(tokens[cursor++]);
    } else {
      return null;
    }
    if (tokens[cursor] === "%") {
      cursor += 1;
      value /= 100;
    }
    return value;
  };

  const value = parseSum();
  return value !== null && cursor === tokens.length && Number.isFinite(value) ? value : null;
}

function optionNumber(text: string): number | null {
  const direct = numericValue(text);
  if (direct !== null) return direct;
  const match = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:literals?)?\s*$/i);
  return match ? Number(match[1]) : null;
}

function minimumBooleanLiterals(expression: BooleanExpression): number | null {
  const variables = booleanVariables(expression);
  if (variables.length === 0 || variables.length > 4) return null;
  const table = truthTable(expression);
  if (!table) return null;
  const onSet = table.values.flatMap((value, index) => (value ? [index] : []));
  if (onSet.length === 0) return 0;
  const candidates: { mask: number; literals: number }[] = [];
  const cube = Array.from({ length: variables.length }, () => "-");
  const visit = (position: number) => {
    if (position === cube.length) {
      const covered = table.values.flatMap((value, index) => {
        const matches = cube.every(
          (bit, i) => bit === "-" || Number(bit) === Number(Boolean(index & (1 << i))),
        );
        return matches ? [index] : [];
      });
      if (covered.some((index) => !table.values[index])) return;
      let mask = 0;
      for (const index of covered) mask |= 1 << index;
      candidates.push({ mask, literals: cube.filter((bit) => bit !== "-").length });
      return;
    }
    for (const value of ["-", "0", "1"]) {
      cube[position] = value;
      visit(position + 1);
    }
  };
  visit(0);

  const target = onSet.reduce((mask, index) => mask | (1 << index), 0);
  const memo = new Map<number, number>();
  const solve = (covered: number): number => {
    if ((covered & target) === target) return 0;
    const cached = memo.get(covered);
    if (cached !== undefined) return cached;
    let selected = -1;
    let fewest = Number.POSITIVE_INFINITY;
    for (const index of onSet) {
      if ((covered & (1 << index)) !== 0) continue;
      const choices = candidates.filter(
        (candidate) =>
          (candidate.mask & (1 << index)) !== 0 &&
          (candidate.mask & covered) !== candidate.mask,
      );
      if (choices.length < fewest) {
        selected = index;
        fewest = choices.length;
      }
    }
    if (selected < 0) return Number.POSITIVE_INFINITY;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (
        (candidate.mask & (1 << selected)) === 0 ||
        (candidate.mask & covered) === candidate.mask
      ) {
        continue;
      }
      best = Math.min(
        best,
        candidate.literals + solve(covered | candidate.mask),
      );
    }
    memo.set(covered, best);
    return best;
  };
  return solve(0);
}

function checkBooleanQuestion(question: Question): SemanticVerdict {
  if (question.kind !== "MCQ") return OK;
  const keyedOption = question.options.find((option) => option.id === question.answer?.[0]);
  if (!keyedOption) return OK;

  if (
    /\bwhich\s+of\s+the\s+following\s+statements\s+is\s+true\b/i.test(question.text) &&
    /\bA\s*(?:[.·*]\s*)?B\s*=\s*A\b/i.test(question.text) &&
    /\bB\s*=\s*1\b/i.test(question.text) &&
    question.options.some((option) => /\bA\b/i.test(option.text) && /\beither\b[\s\S]*\btrue\b[\s\S]*\bfalse\b/i.test(option.text)) &&
    question.options.some((option) => /\bidentity\s+property\b/i.test(option.text))
  ) {
    return fail("More than one option is true under the stated Boolean condition.");
  }

  const optionExpressions = question.options.map((option) => parseBooleanExpression(option.text));
  const optionRelations = question.options.map((option) => parseBooleanRelation(option.text));
  const keyIndex = question.options.findIndex((option) => option.id === keyedOption.id);

  if (
    /\b(?:valid|correct)\s+identit(?:y|ies)\b|\bdistributive law\b/i.test(question.text) &&
    optionRelations.every((relation) => relation !== null)
  ) {
    const valid = optionRelations.flatMap((relation, index) =>
      isTautology(relation) ? [index] : [],
    );
    if (valid.length === 0) {
      return fail("None of the options is a valid Boolean identity.");
    }
    if (valid.length > 1) {
      return fail("More than one option is a valid Boolean identity.");
    }
    if (valid.length === 1 && valid[0] !== keyIndex) {
      return fail("The keyed answer is not the only valid Boolean identity.");
    }
  }

  const definitionText = extractBooleanDefinition(question.text);
  const definition = definitionText ? parseBooleanExpression(definitionText) : null;
  const definitionTable = definition ? truthTable(definition) : null;
  if (definition && definitionTable) {
    if (/\bdual\b/i.test(question.text)) {
      const dualTable = truthTable(dualBooleanExpression(definition));
      const matches = optionExpressions.flatMap((item, index) =>
        item && sameTruthTable(truthTable(item), dualTable) ? [index] : [],
      );
      if (matches.length !== 1) {
        return fail("The options do not contain exactly one Boolean dual of the expression in the question.");
      }
      if (matches[0] !== keyIndex) {
        return fail("The keyed answer is not the Boolean dual of the expression in the question.");
      }
    }

    const expansionQuestion = /\b(?:expand|expansion|equivalent|simplif)\w*\b/i.test(question.text);
    if (expansionQuestion && optionExpressions.every((item) => item !== null)) {
      const matches = optionExpressions.flatMap((item, index) =>
        sameTruthTable(truthTable(item!), definitionTable) ? [index] : [],
      );
      if (matches.length > 1) {
        return fail("More than one option is Boolean-equivalent to the expression in the question.");
      }
      if (matches.length === 0) {
        return fail("None of the options is Boolean-equivalent to the expression in the question.");
      }
      if (matches.length === 1 && matches[0] !== keyIndex) {
        return fail("The keyed answer is not Boolean-equivalent to the expression in the question.");
      }
    }

    const assignments = [...question.text.matchAll(/\b([A-Z])\s*=\s*([01])\b/g)];
    if (definition && assignments.length > 0 && /\b(?:value|output)\b/i.test(question.text)) {
      const values = Object.fromEntries(assignments.map((match) => [match[1], match[2] === "1"]));
      if (booleanVariables(definition).every((name) => Object.hasOwn(values, name))) {
        const expected = evaluateBoolean(definition, values);
        const matches = question.options.flatMap((option, index) => {
          const value = optionBooleanValue(option.text, values);
          return value === expected ? [index] : [];
        });
        if (matches.length !== 1) {
          return fail("The options do not contain exactly one value matching the stated Boolean inputs.");
        }
        if (matches[0] !== keyIndex) {
          return fail("The keyed answer does not match the Boolean function at the stated inputs.");
        }
      }
    }

    if (/\bminimum\b[^?]*\bliterals?\b/i.test(question.text)) {
      const minimum = minimumBooleanLiterals(definition);
      const keyedValue = optionNumber(keyedOption.text);
      if (minimum !== null && keyedValue !== null && keyedValue !== minimum) {
        return fail(`The minimum equivalent Boolean expression requires ${minimum} literals.`);
      }
      const claimed = question.explanation?.match(
        /\b(?:requires?|resulting in|minimum(?:\s+is)?|simplifies to)\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+literals?\b/i,
      );
      const claimedCount = claimed
        ? Number.isNaN(Number(claimed[1]))
          ? ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].indexOf(
              claimed[1].toLowerCase(),
            )
          : Number(claimed[1])
        : null;
      if (minimum !== null && claimedCount !== null && claimedCount !== minimum) {
        return fail(`The explanation claims ${claimedCount} literals, but the minimum is ${minimum}.`);
      }
    }
  }

  const simplifiedTo = question.text.match(/\bsimplif\w*\s+to\s+([01])\b/i);
  if (simplifiedTo && optionExpressions.every((item) => item !== null)) {
    const target = simplifiedTo[1] === "1";
    const matching = optionExpressions.flatMap((item, index) =>
      truthTable(item!)?.values.every((value) => value === target) ? [index] : [],
    );
    if (matching.length > 1) {
      return fail("More than one option simplifies to the stated Boolean value.");
    }
    if (matching.length === 0) {
      return fail("None of the options simplifies to the Boolean value stated in the question.");
    }
    if (matching.length === 1 && matching[0] !== keyIndex) {
      return fail("The keyed answer does not simplify to the Boolean value stated in the question.");
    }
  }

  if (
    definition &&
    /\b(?:evaluates?|simplif\w*|reduces?)\s+to\s+which\b/i.test(question.text)
  ) {
    const table = truthTable(definition);
    if (table && table.values.every((value) => value === table.values[0])) {
      const expected = table.values[0];
      const matches = question.options.flatMap((option, index) =>
        optionBooleanValue(option.text) === expected ? [index] : [],
      );
      if (matches.length !== 1) {
        return fail("The options do not contain exactly one value matching the Boolean expression.");
      }
      if (matches[0] !== keyIndex) {
        return fail("The keyed answer does not match the value of the Boolean expression.");
      }
    }
  }

  for (let left = 0; left < optionExpressions.length; left += 1) {
    for (let right = left + 1; right < optionExpressions.length; right += 1) {
      const leftExpression = optionExpressions[left];
      const rightExpression = optionExpressions[right];
      if (leftExpression && rightExpression &&
          sameTruthTable(truthTable(leftExpression), truthTable(rightExpression))) {
        return fail("Two options are equivalent Boolean expressions.");
      }
    }
  }
  return OK;
}

function checkNumericQuestion(question: Question): SemanticVerdict {
  if (question.kind !== "MCQ") return OK;
  const expressions = question.options.map((option) => optionNumber(option.text));
  for (let left = 0; left < expressions.length; left += 1) {
    for (let right = left + 1; right < expressions.length; right += 1) {
      if (
        expressions[left] !== null &&
        expressions[right] !== null &&
        near(expressions[left]!, expressions[right]!)
      ) {
        return fail("Two options express the same numeric value.");
      }
    }
  }

  const functionCount = question.text.match(
    /\bhow many\s+(?:distinct\s+)?Boolean functions?\b[\s\S]*?\b(\d+)\s+variables?\b/i,
  );
  if (functionCount) {
    const variableCount = Number(functionCount[1]);
    if (variableCount <= 5) {
      const expected = 2 ** (2 ** variableCount);
      const keyedValue = optionNumber(
        question.options.find((option) => option.id === question.answer?.[0])?.text ?? "",
      );
      if (!Number.isSafeInteger(expected) || keyedValue !== expected) {
        return fail(`The number of Boolean functions of ${variableCount} variables is ${expected}.`);
      }
    }
  }

  const calculation = question.text.match(
    /\b(?:calculate|compute|evaluate|what is)\s+(?:the\s+)?(?:value of\s+)?([0-9\s()+\-*/^.%×÷]+?)\s*\??$/i,
  )?.[1];
  if (!calculation) return OK;
  const expected = numericValue(calculation);
  const key = optionNumber(question.options.find((option) => option.id === question.answer?.[0])?.text ?? "");
  if (expected !== null && key !== null && !near(expected, key)) {
    return fail(`The keyed answer is ${key}, but the stated calculation evaluates to ${expected}.`);
  }
  return OK;
}

function checkExplanationCalculations(question: Question): SemanticVerdict {
  const explanation = question.explanation;
  if (!explanation) return OK;
  const equations =
    /(\d+(?:\.\d+)?(?:\s*[+\-*/^×÷]\s*\d+(?:\.\d+)?)+)\s*=\s*(-?\d+(?:\.\d+)?)/g;
  for (const match of explanation.matchAll(equations)) {
    const actual = numericValue(match[1]);
    const stated = Number(match[2]);
    if (actual !== null && !near(actual, stated)) {
      return fail(`The explanation's calculation evaluates to ${actual}, not ${stated}.`);
    }
  }
  return OK;
}

const BROAD_OBJECTIVE =
  /\b(?:primary|main|principal)\s+(?:goal|objective|purpose)\b/i;
const DISTINCT_OBJECTIVES =
  /\b(?:throughput|turnaround time|response time|fair(?:ness)?|(?:cpu|resource) utilization)\b/i;

/** Reject broad "primary goal" MCQs when multiple standard objectives are options. */
function checkAmbiguousObjective(question: Question): SemanticVerdict {
  if (
    question.kind !== "MCQ" ||
    !BROAD_OBJECTIVE.test(question.text) ||
    question.options.filter((option) => DISTINCT_OBJECTIVES.test(option.text)).length < 2
  ) {
    return OK;
  }
  return fail(
    "The question lists multiple standard objectives without enough context to identify one primary answer.",
  );
}

const KARNAUGH_GROUPING = /\b(?:karnaugh|k[\s-]?map)\b/i;
const GROUP_SIZE_OPTION =
  /\b(?:1|2|4|8|16|32|64|one|two|four|eight|sixteen|thirty[- ]two|sixty[- ]four)\b/i;

/** Reject K-map group-size questions when several listed sizes are valid. */
function checkAmbiguousKarnaughGrouping(question: Question): SemanticVerdict {
  const asksForSize = /\bhow many\b|\bgroup size\b|\bsize of (?:a )?group\b/i.test(
    question.text,
  );
  const boundedByMapSize =
    /\b(?:largest|maximum|smallest|minimum)\b/i.test(question.text) &&
    /\b(?:\d+|one|two|three|four|five|six)\s*[- ]?variable\b/i.test(question.text);
  if (
    question.kind !== "MCQ" ||
    !KARNAUGH_GROUPING.test(question.text) ||
    !/\b(?:adjacent|group(?:ed|ing)?)\b/i.test(question.text) ||
    !asksForSize ||
    boundedByMapSize ||
    question.options.filter((option) => GROUP_SIZE_OPTION.test(option.text)).length < 2
  ) {
    return OK;
  }
  return fail(
    "The K-map question lists multiple valid group sizes without asking for a specific size.",
  );
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
  for (const check of [
    checkCoding,
    checkArithmetic,
    checkNumericQuestion,
    checkSortingComparisonQuestion,
    checkQuadraticSortingOptions,
    checkAmbiguousMinMaxAccess,
    checkAmbiguousInsertionComplexity,
    checkUnqualifiedBstComplexity,
    checkCanonicalMintermQuestion,
    checkBooleanQuestion,
    checkAmbiguousObjective,
    checkAmbiguousKarnaughGrouping,
    checkExplanationCalculations,
    checkExplanation,
  ]) {
    const verdict = check(question);
    if (!verdict.ok) return verdict;
  }
  return OK;
}