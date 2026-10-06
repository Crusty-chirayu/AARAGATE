/**
 * Semantic validation regression suite — practice question quality.
 *
 * Encodes the two known defective generated questions as permanent
 * regressions: a letter-coding question whose worked example contradicts its
 * own key (CAT→3120, DOG keyed as 471 where the rule gives 4157), and an
 * arithmetic question no listed option can satisfy (difference 10, product
 * 240, key "16 and 6" which multiplies to 96). Around them: the gates that
 * keep the validator sound, the malformed-output matrix, and static guards
 * pinning the edge function's bounded repair loop.
 *
 * Everything is deterministic fixture work — no live AI, no network.
 *
 *   npx vitest run tests/practice-semantics.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parsePracticeQuestions } from "../src/lib/practice";
import { verifyQuestionSemantics } from "../src/lib/semantics";
import { validateQuestion } from "../src/lib/quiz";

const PRACTICE_GENERATOR = "supabase/functions/practice-generator/index.ts";

/** Read a repo-relative source file for the static guards. */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const payload = (questions: unknown[]) => JSON.stringify({ questions });

/** Semantic verdict of a fixture that must already be structurally valid. */
function semanticError(question: unknown): string | null {
  const structural = validateQuestion(question);
  if (!structural.ok) throw new Error(`fixture must pass structural validation: ${structural.error}`);
  const verdict = verifyQuestionSemantics(structural.question);
  return verdict.ok ? null : verdict.error;
}

/* -------------------------------------------------------------------------- */
/* Fixtures — reconstructions of the two observed defective questions          */
/* -------------------------------------------------------------------------- */

/** DEFECT 1: DOG must code to 4157 under the stated rule; the key says 471. */
const codingDefect = {
  kind: "MCQ",
  marks: 2,
  text: "If CAT is coded as 3120, how will DOG be coded?",
  options: [
    { id: "A", text: "471" },
    { id: "B", text: "4157" },
    { id: "C", text: "3146" },
    { id: "D", text: "4710" },
  ],
  answer: ["A"],
  explanation: "Each letter is replaced by its position in the alphabet: D = 4, O = 15, G = 7.",
};

/** The same question with the correct key — must pass. */
const codingCorrect = { ...codingDefect, answer: ["B"] };

/** DEFECT 1c: the reported phrasing asks "what is DOG?" — same rule, same wrong key. */
const codingWhatIs = {
  ...codingDefect,
  text: "If CAT is coded as 3120 using alphabet positions, what is DOG?",
};

/** DEFECT 1b: the premise itself states two pairs under different rules. */
const codingContradictoryPremise = {
  ...codingDefect,
  text: "If CAT is coded as 3120 and DOG is coded as 471, what will FOX be coded as?",
  answer: ["B"],
};

/** DEFECT 2: difference 10 and product 240; "16 and 6" multiplies to 96. */
const arithmeticDefect = {
  kind: "MCQ",
  marks: 2,
  text: "Two numbers differ by 10 and their product is 240. Which of the following could be the two numbers?",
  options: [
    { id: "A", text: "16 and 6" },
    { id: "B", text: "20 and 10" },
    { id: "C", text: "30 and 20" },
    { id: "D", text: "24 and 14" },
  ],
  answer: ["A"],
  explanation: "The pair must differ by 10 and multiply to 240.",
};

/** Product 200 instead: "20 and 10" genuinely satisfies both constraints. */
const arithmeticValid = {
  ...arithmeticDefect,
  text: "Two numbers differ by 10 and their product is 200. Which of the following could be the two numbers?",
  answer: ["B"],
};

/* -------------------------------------------------------------------------- */

describe("regression — coding question with a self-contradictory key", () => {
  it("rejects DOG keyed as 471 when the stated rule gives 4157", () => {
    expect(semanticError(codingDefect)).toMatch(/coding rule \(expected 4157\)/);
  });

  it("rejects the same defect phrased as 'what is DOG?'", () => {
    expect(semanticError(codingWhatIs)).toMatch(/coding rule \(expected 4157\)/);
    expect(semanticError({ ...codingWhatIs, answer: ["B"] })).toBeNull();
  });

  it("does not read an all-caps word in a conceptual follow-up as a query", () => {
    const conceptual = {
      ...codingDefect,
      text: "If CAT is coded as 3120, what is THE machine class of ab*?",
    };
    expect(semanticError(conceptual)).toBeNull();
  });

  it("rejects the batch when only the defective question is offered", () => {
    const parsed = parsePracticeQuestions(payload([codingDefect]));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("no_valid_questions");
  });

  it("drops the defective entry with a reason and keeps the valid ones", () => {
    const parsed = parsePracticeQuestions(payload([codingDefect, codingCorrect]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.rejected[0].index).toBe(0);
    expect(parsed.rejected[0].error).toMatch(/expected 4157/);
  });

  it("accepts the corrected key", () => {
    expect(semanticError(codingCorrect)).toBeNull();
  });

  it("rejects a premise whose stated pairs follow different rules", () => {
    expect(semanticError(codingContradictoryPremise)).toMatch(/not consistent with a single rule/);
  });

  it("checks the NAT range against the rule's code", () => {
    const base = {
      kind: "NAT",
      marks: 1,
      text: "If CAT is coded as 3120, what will DOG be coded as? Give the numeric code.",
      options: [],
      answer: null,
      explanation: "Positions D=4, O=15, G=7 concatenate to 4157.",
    };
    expect(semanticError({ ...base, nat_range: { min: 4157, max: 4157 } })).toBeNull();
    expect(semanticError({ ...base, nat_range: { min: 0, max: 999 } })).toMatch(
      /outside the accepted range/,
    );
  });

  it("passes through a cipher no rule explains instead of guessing", () => {
    const customCipher = { ...codingDefect, text: "If CAT is coded as 5555, how will DOG be coded?" };
    expect(semanticError(customCipher)).toBeNull();
  });
});

describe("regression — arithmetic question no option can satisfy", () => {
  it("rejects '16 and 6' against difference 10 / product 240", () => {
    expect(semanticError(arithmeticDefect)).toMatch(/does not satisfy the stated product of 240/);
  });

  it("rejects the batch when only the defective question is offered", () => {
    const parsed = parsePracticeQuestions(payload([arithmeticDefect]));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("no_valid_questions");
  });

  it("drops the defective entry with a reason and keeps a valid sibling", () => {
    const parsed = parsePracticeQuestions(payload([arithmeticDefect, arithmeticValid]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.rejected[0].index).toBe(0);
    expect(parsed.rejected[0].error).toMatch(/product of 240/);
  });

  it("accepts a key that satisfies every stated constraint", () => {
    expect(semanticError(arithmeticValid)).toBeNull();
  });

  it("rejects a violating key even when another option would satisfy", () => {
    expect(semanticError({ ...arithmeticValid, answer: ["A"] })).toMatch(
      /does not satisfy the stated product of 200/,
    );
  });

  it("rejects two options satisfying two independent constraints", () => {
    const ambiguous = {
      ...arithmeticDefect,
      text: "Two numbers differ by 10 and their sum is 30. Which of the following could be the two numbers?",
      options: [
        { id: "A", text: "20 and 10" },
        { id: "B", text: "10 and 20" },
        { id: "C", text: "25 and 15" },
        { id: "D", text: "5 and 15" },
      ],
      answer: ["A"],
    };
    expect(semanticError(ambiguous)).toMatch(/no single correct answer/);
    // An ordering cue collapses the two into one ordered answer — no verdict.
    expect(semanticError({ ...ambiguous, text: `${ambiguous.text} Give the larger number first.` })).toBeNull();
  });

  it("never judges a single-constraint question ambiguous", () => {
    const single = {
      ...arithmeticDefect,
      text: "Two numbers differ by 10. Which of the following could be the two numbers?",
      answer: ["A"],
    };
    expect(semanticError(single)).toBeNull();
  });

  it("skips the check entirely when the question negates its own constraint", () => {
    const negated = {
      ...arithmeticDefect,
      text: "Which of these pairs cannot have a difference of 10?",
      options: [
        { id: "A", text: "16 and 5" },
        { id: "B", text: "20 and 10" },
        { id: "C", text: "30 and 20" },
        { id: "D", text: "24 and 14" },
      ],
      answer: ["A"],
    };
    expect(semanticError(negated)).toBeNull();
  });
});

describe("answer ↔ explanation consistency", () => {
  const mcq = {
    kind: "MCQ",
    marks: 2,
    text: "Which scheduler is preemptive?",
    options: [
      { id: "A", text: "First come, first served" },
      { id: "B", text: "Round robin" },
      { id: "C", text: "Shortest job first" },
    ],
    answer: ["A"],
    explanation: "The correct answer is B because round robin preempts at the end of its quantum.",
  };

  it("rejects an explanation that names a different option as correct", () => {
    expect(semanticError(mcq)).toMatch(/explanation names option B/);
  });

  it("accepts an explanation that agrees with the key", () => {
    expect(semanticError({ ...mcq, answer: ["B"] })).toBeNull();
  });

  it("does not read 'Option C is incorrect' as a claim for C", () => {
    expect(
      semanticError({ ...mcq, answer: ["A"], explanation: "Option C is incorrect; the answer is A." }),
    ).toBeNull();
  });

  it("harvests multi-letter spans like 'the correct options are A and C'", () => {
    const msq = {
      kind: "MSQ",
      marks: 2,
      text: "Which of these are page-replacement policies?",
      options: [
        { id: "A", text: "LRU" },
        { id: "B", text: "FIFO" },
        { id: "C", text: "Dijkstra's algorithm" },
      ],
      answer: ["A"],
      explanation: "The correct options are A and C.",
    };
    expect(semanticError(msq)).toMatch(/explanation names option C/);
    expect(semanticError({ ...msq, answer: ["A", "C"] })).toBeNull();
  });

  it("rejects a NAT explanation whose stated answer falls outside the range", () => {
    const nat = {
      kind: "NAT",
      marks: 1,
      text: "How many bits are in the offset of a 4 KiB page?",
      options: [],
      answer: null,
      nat_range: { min: 12, max: 12 },
      explanation: "The answer is 12 because log2(4096) = 12.",
    };
    expect(semanticError(nat)).toBeNull();
    expect(semanticError({ ...nat, explanation: "The answer is 11." })).toMatch(
      /outside the accepted range/,
    );
  });
});

describe("generated-question contract and malformed-output matrix", () => {
  it("drops a question that carries no explanation", () => {
    const withoutExplanation = {
      kind: codingCorrect.kind,
      marks: codingCorrect.marks,
      text: codingCorrect.text,
      options: codingCorrect.options,
      answer: codingCorrect.answer,
    };
    const parsed = parsePracticeQuestions(payload([withoutExplanation, codingCorrect]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.rejected[0].index).toBe(0);
    expect(parsed.rejected[0].error).toMatch(/must carry an explanation/);
  });

  it("drops duplicate option text through the parse", () => {
    const dup = {
      ...codingCorrect,
      options: [
        { id: "A", text: "4157" },
        { id: "B", text: "4157" },
      ],
      answer: ["B"],
    };
    expect(() => semanticError(dup)).toThrow(/structural validation/);
    const parsed = parsePracticeQuestions(payload([dup, codingCorrect]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.rejected[0].error).toMatch(/Duplicate option text/);
  });

  const malformedCases: [string, unknown, RegExp][] = [
    ["options as plain strings", { ...codingCorrect, options: ["one", "two"] }, /must be an object/],
    ["answer as a bare string", { ...codingCorrect, answer: "A" }, /at least one answer id/],
    [
      "nat_range as an array",
      { kind: "NAT", marks: 1, text: "Compute the throughput.", options: [], nat_range: [1, 5] },
      /numeric range/,
    ],
    ["explanation as a number", { ...codingCorrect, explanation: 42 }, /must carry an explanation/],
  ];
  it.each(malformedCases)("rejects %s with a reason", (_label, entry, expected) => {
    const parsed = parsePracticeQuestions(payload([entry, codingCorrect]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.rejected[0].index).toBe(0);
    expect(parsed.rejected[0].error).toMatch(expected);
  });
});

describe("bounded AI repair in the practice-generator edge function", () => {
  const source = read(PRACTICE_GENERATOR);

  it("caps generation at two attempts", () => {
    expect(source).toMatch(/const MAX_GENERATION_ATTEMPTS = 2;/);
  });

  it("parses inside the loop, breaks on success or at the cap", () => {
    expect(source).toMatch(/parsed = parsePracticeQuestions\(reply\)/);
    expect(source).toMatch(/parsed\.ok \|\| generationAttempts >= MAX_GENERATION_ATTEMPTS/);
  });

  it("feeds the rejection reason back to the model before regenerating", () => {
    expect(source).toContain("Your reply was rejected");
    expect(source).toMatch(/role: "assistant", content: reply/);
  });

  it("never wraps generation in an unbounded or timed loop", () => {
    expect(source).not.toMatch(/while\s*\(\s*true\s*\)/);
    expect(source).not.toMatch(/setInterval/);
    expect(source).not.toMatch(/generationAttempts\+\+;\s*\/\/ no cap/);
  });

  it("reports the attempt count in stats for observability", () => {
    expect(source).toContain("attempts: generationAttempts");
  });
});