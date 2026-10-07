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

import {
  parsePracticeQuestions,
  practiceQuestionCounts,
  questionCountMismatch,
} from "../src/lib/practice";
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

const ambiguousCpuSchedulingGoal = {
  kind: "MCQ",
  marks: 2,
  text: "What is the primary goal of CPU scheduling in an operating system?",
  options: [
    { id: "A", text: "To maximize the use of I/O devices." },
    { id: "B", text: "To minimize the turnaround time of processes." },
    { id: "C", text: "To ensure fair allocation of CPU time among processes." },
    { id: "D", text: "To maximize CPU throughput." },
  ],
  answer: ["C"],
  explanation: "The primary goal is fair allocation of CPU time among processes.",
};

const ambiguousKarnaughGrouping = {
  kind: "MCQ",
  marks: 2,
  text: "In a Karnaugh map, how many adjacent cells can be grouped together to form a single group?",
  options: [
    { id: "A", text: "One" },
    { id: "B", text: "Two" },
    { id: "C", text: "Four" },
    { id: "D", text: "Eight" },
  ],
  answer: ["D"],
  explanation: "Adjacent cells can be grouped in powers of two, including eight.",
};

const productionBooleanSimplification = {
  kind: "MCQ",
  marks: 2,
  text: "Which of the following Boolean expressions simplifies to 1?",
  options: [
    { id: "A", text: "A + A'" },
    { id: "B", text: "AB + A'B'" },
    { id: "C", text: "A + 0" },
    { id: "D", text: "A . A'" },
  ],
  answer: ["A"],
  explanation: "A + A' always evaluates to 1 by the complement law.",
};

const productionExpansion = {
  kind: "MCQ",
  marks: 2,
  text: "Consider the following Boolean expression: (A + B)(A' + C). Which of the following options correctly expands this expression?",
  options: [
    { id: "A", text: "AA' + AC + BA' + BC" },
    { id: "B", text: "AB + AC + A'B' + BC" },
    { id: "C", text: "ABC + AB + C" },
    { id: "D", text: "A'B + AC + A'C" },
  ],
  answer: ["A"],
  explanation: "Distribution gives AA' + AC + BA' + BC.",
};

const productionMinimumLiteralQuestion = {
  kind: "MCQ",
  marks: 4,
  text: "What is the minimum number of literals needed to express the Boolean function F(A, B, C) = AB + A'C + BC in its simplest form?",
  options: [
    { id: "A", text: "4" },
    { id: "B", text: "3" },
    { id: "C", text: "5" },
    { id: "D", text: "2" },
  ],
  answer: ["B"],
  explanation:
    "The function simplifies to three literals: F(A, B, C) = AB + A'C + BC.",
};

const productionMultipleBooleanIdentities = {
  kind: "MCQ",
  marks: 2,
  text: "Which of the following is a valid identity in Boolean algebra?",
  options: [
    { id: "A", text: "A . 1 = 0" },
    { id: "B", text: "A + 0 = A" },
    { id: "C", text: "A . A = A" },
    { id: "D", text: "A + A' = 0" },
  ],
  answer: ["B"],
  explanation: "A + 0 = A is an identity.",
};

const productionMultipleDistributiveForms = {
  kind: "MCQ",
  marks: 2,
  text: "In Boolean algebra, which of the following identities describes the distributive law?",
  options: [
    { id: "A", text: "A + (B . C) = (A + B) . (A + C)" },
    { id: "B", text: "A . (B + C) = (A . B) + (A . C)" },
    { id: "C", text: "A + A' = 1" },
    { id: "D", text: "A . A' = 0" },
  ],
  answer: ["B"],
  explanation: "A . (B + C) = (A . B) + (A . C) is the distributive law.",
};

const productionDualQuestion = {
  kind: "MCQ",
  marks: 3,
  text: "What is the dual of the Boolean expression (A + B)(C + D)?",
  options: [
    { id: "A", text: "AC + AD + BC + BD" },
    { id: "B", text: "AB + CD" },
    { id: "C", text: "AD + BC + 0" },
    { id: "D", text: "ADC + BDC" },
  ],
  answer: ["A"],
  explanation: "The dual is obtained by interchanging AND and OR.",
};

const productionAbsorptionQuestion = {
  kind: "MCQ",
  marks: 2,
  text: "Which of the following is a valid simplification of the Boolean expression A + AB?",
  options: [
    { id: "A", text: "A" },
    { id: "B", text: "B" },
    { id: "C", text: "AB" },
    { id: "D", text: "A + B" },
  ],
  answer: ["A"],
  explanation: "By the absorption law, A + AB simplifies to A.",
};

const productionBooleanEvaluation = {
  kind: "MCQ",
  marks: 3,
  text: "Identify the output of the Boolean function F(A, B, C) = A'B + AB'C + ABC' + A'BC when A=0, B=1, and C=1.",
  options: [
    { id: "A", text: "0" },
    { id: "B", text: "1" },
    { id: "C", text: "undefined" },
    { id: "D", text: "depends on A" },
  ],
  answer: ["B"],
  explanation: "Substitution gives 1.",
};

const productionLatexWrongExpansion = {
  kind: "MCQ",
  marks: 2,
  text: "Which of the following expressions is equivalent to \\( (A + B)(A' + C) \\)?",
  options: [
    { id: "A", text: "A + B + C" },
    { id: "B", text: "A + B \\cdot C" },
    { id: "C", text: "A \\cdot C + B \\cdot C" },
    { id: "D", text: "A + B + A' \\cdot C" },
  ],
  answer: ["D"],
  explanation:
    "Using distribution, we find that \\( (A + B)(A' + C) = A + B + A' \\cdot C \\).",
};

const productionEquivalentCorrectOptions = {
  kind: "MCQ",
  marks: 2,
  text: "The expression \\( A \\cdot (B + C) + A' \\cdot B \\) can be simplified to which of the following forms?",
  options: [
    { id: "A", text: "A + B" },
    { id: "B", text: "A + A' \\cdot B" },
    { id: "C", text: "B + C" },
    { id: "D", text: "A + B + C" },
  ],
  answer: ["B"],
  explanation: "Using the Consensus Theorem, the expression simplifies to A + A' · B.",
};

const productionWrongBooleanFunctionCount = {
  kind: "MCQ",
  marks: 2,
  text: "How many distinct Boolean functions can be formed with 3 variables?",
  options: [
    { id: "A", text: "8" },
    { id: "B", text: "16" },
    { id: "C", text: "32" },
    { id: "D", text: "64" },
  ],
  answer: ["B"],
  explanation:
    "A Boolean function with n variables has 2^(2^n) possibilities. For 3 variables, 2^8 = 256, so option B is correct.",
};

/* -------------------------------------------------------------------------- */

describe("regression — ambiguous generated objective question", () => {
  it("rejects the production CPU-scheduling question with multiple defensible goals", () => {
    expect(semanticError(ambiguousCpuSchedulingGoal)).toMatch(
      /multiple standard objectives without enough context/,
    );
    const parsed = parsePracticeQuestions(payload([ambiguousCpuSchedulingGoal]));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("no_valid_questions");
  });
});

describe("regression — ambiguous Karnaugh-map group size", () => {
  it("rejects a question that lists multiple valid group sizes without a specific criterion", () => {
    expect(semanticError(ambiguousKarnaughGrouping)).toMatch(/multiple valid group sizes/);
    const parsed = parsePracticeQuestions(payload([ambiguousKarnaughGrouping]));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("no_valid_questions");
  });

  it("accepts a question that explicitly asks for the largest group size", () => {
    expect(
      semanticError({
        ...ambiguousKarnaughGrouping,
        text: "In a 3-variable Karnaugh map, what is the largest group size of adjacent cells?",
      }),
    ).toBeNull();
  });
});

describe("regression — production Boolean algebra set", () => {
  it("keeps the two coherent production questions and rejects the three defective ones", () => {
    const result = parsePracticeQuestions(
      payload([
        productionBooleanSimplification,
        productionExpansion,
        productionMinimumLiteralQuestion,
        productionMultipleBooleanIdentities,
        productionMultipleDistributiveForms,
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions.map((question) => question.text)).toEqual([
      productionBooleanSimplification.text,
      productionExpansion.text,
    ]);
    expect(result.rejected.map(({ index }) => index)).toEqual([2, 3, 4]);
  });

  it("rejects a wrong key when a different option alone simplifies to the stated value", () => {
    expect(semanticError({ ...productionBooleanSimplification, answer: ["B"] })).toMatch(
      /keyed answer does not simplify/,
    );
    expect(semanticError(productionBooleanSimplification)).toBeNull();
  });

  it("checks expansion options against the expression in the stem", () => {
    expect(semanticError(productionExpansion)).toBeNull();
    expect(semanticError({ ...productionExpansion, answer: ["B"] })).toMatch(
      /keyed answer is not Boolean-equivalent/,
    );
  });

  it("rejects a Boolean assignment question with equivalent numeric and variable options", () => {
    const question = {
      kind: "MCQ",
      marks: 2,
      text: "If A = 1 and B = 0, what is the value of the expression A OR (A AND B)?",
      options: [
        { id: "A", text: "0" },
        { id: "B", text: "1" },
        { id: "C", text: "A" },
        { id: "D", text: "NOT A" },
      ],
      answer: ["B"],
      explanation: "A OR (A AND B) evaluates to 1.",
    };
    expect(semanticError(question)).toMatch(
      /options do not contain exactly one value matching the stated Boolean inputs/,
    );

    const unique = {
      ...question,
      text: "If A = 1 and B = 0, what is the value of the expression A AND B?",
      options: [
        { id: "A", text: "0" },
        { id: "B", text: "1" },
        { id: "C", text: "2" },
        { id: "D", text: "3" },
      ],
      answer: ["A"],
      explanation: "A AND B evaluates to 0.",
    };
    expect(semanticError(unique)).toBeNull();
  });

  it("validates canonical SOP options against the listed minterms", () => {
    const question = {
      kind: "MCQ",
      marks: 3,
      text: "What is the canonical Sum of Products (SOP) form for a function that is true for minterms 1, 2, and 3? (Assuming a 3-variable function A, B, C, where minterms correspond to the decimal representation of binary inputs)",
      options: [
        { id: "A", text: "A'B'C + A'BC + AB'C" },
        { id: "B", text: "A'BC + AB'C + ABC" },
        { id: "C", text: "AB + A'C + A'B" },
        { id: "D", text: "A'B + B'C" },
      ],
      answer: ["A"],
      explanation: "The canonical SOP is the sum of the minterms that evaluate to one.",
    };
    expect(semanticError(question)).toMatch(
      /options do not contain exactly one expression for the stated minterms/,
    );

    const corrected = {
      ...question,
      options: [
        { id: "A", text: "A'B'C + A'BC' + A'BC" },
        ...question.options.slice(1),
      ],
    };
    expect(semanticError(corrected)).toBeNull();
  });

  it("rejects a true-statement question with two valid identity interpretations", () => {
    const question = {
      kind: "MCQ",
      marks: 2,
      text: "Which of the following statements is true regarding the operation AB = A when B = 1?",
      options: [
        { id: "A", text: "A is necessarily true" },
        { id: "B", text: "A can be either true or false" },
        { id: "C", text: "B must also be false" },
        { id: "D", text: "This indicates the identity property" },
      ],
      answer: ["B"],
      explanation: "When B is one, AB equals A for either value of A.",
    };
    expect(semanticError(question)).toMatch(
      /More than one option is true under the stated Boolean condition/,
    );
  });

  it("rejects fixed-array comparison questions without implementation assumptions", () => {
    const question = {
      kind: "MCQ",
      marks: 2,
      text: "Given the following array: [4, 2, 3, 1], which sorting algorithm would sort it with the maximum number of comparisons?",
      options: [
        { id: "A", text: "Bubble Sort" },
        { id: "B", text: "Selection Sort" },
        { id: "C", text: "Insertion Sort" },
        { id: "D", text: "Merge Sort" },
      ],
      answer: ["B"],
      explanation: "Selection sort always checks each remaining element.",
    };
    expect(semanticError(question)).toMatch(
      /needs explicit algorithm implementations/,
    );
  });

  it("rejects a worst-case quadratic sort question with multiple correct algorithms", () => {
    const question = {
      kind: "MCQ",
      marks: 3,
      text: "Which sorting algorithm has a worst-case time complexity of O(n^2)?",
      options: [
        { id: "A", text: "Bubble Sort" },
        { id: "B", text: "Merge Sort" },
        { id: "C", text: "Quick Sort" },
        { id: "D", text: "Heap Sort" },
      ],
      answer: ["A"],
      explanation: "Bubble Sort has a worst-case time complexity of O(n^2).",
    };
    expect(semanticError(question)).toMatch(
      /More than one listed sorting algorithm has the stated worst-case O\(n²\) complexity/,
    );
  });

  it("rejects vague min/max access questions when multiple tree structures are offered", () => {
    const question = {
      kind: "MCQ",
      marks: 2,
      text: "Which of the following data structures allows for fast access to both minimum and maximum elements?",
      options: [
        { id: "A", text: "Binary Search Tree" },
        { id: "B", text: "Red-Black Tree" },
        { id: "C", text: "Heap" },
        { id: "D", text: "Linked List" },
      ],
      answer: ["C"],
      explanation: "A heap efficiently exposes its top-priority element.",
    };
    expect(semanticError(question)).toMatch(
      /must state exact complexity guarantees/,
    );
  });

  it("rejects constant-time insertion questions with multiple plausible structures", () => {
    const question = {
      kind: "MCQ",
      marks: 2,
      text: "Which of these data structures offers O(1) average time complexity for insertion?",
      options: [
        { id: "A", text: "Array List" },
        { id: "B", text: "Singly Linked List" },
        { id: "C", text: "Hash Table" },
        { id: "D", text: "Binary Tree" },
      ],
      answer: ["C"],
      explanation: "Hash tables offer average O(1) insertion.",
    };
    expect(semanticError(question)).toMatch(
      /must specify the data-structure operation and assumptions/,
    );
  });

  it("rejects an unqualified BST complexity question that offers average and worst-case answers", () => {
    const question = {
      kind: "MCQ",
      marks: 2,
      text: "What is the time complexity of finding the maximum element in a binary search tree (BST) with n nodes?",
      options: [
        { id: "A", text: "O(log n)" },
        { id: "B", text: "O(n)" },
        { id: "C", text: "O(1)" },
        { id: "D", text: "O(log n) in skewed trees" },
      ],
      answer: ["B"],
      explanation: "A skewed BST can require visiting every node.",
    };
    expect(semanticError(question)).toMatch(
      /must specify balancing or the average\/worst case/,
    );
  });

  it("rejects unsorted-array insertion questions that omit the insertion position", () => {
    const question = {
      kind: "MCQ",
      marks: 2,
      text: "What is the average time complexity of inserting an element into an unsorted array of size n?",
      options: [
        { id: "A", text: "O(1)" },
        { id: "B", text: "O(n)" },
        { id: "C", text: "O(log n)" },
        { id: "D", text: "O(n log n)" },
      ],
      answer: ["B"],
      explanation: "Array insertion may require shifting elements.",
    };
    expect(semanticError(question)).toMatch(
      /depends on the insertion position/,
    );
  });

  it("rejects the wrong minimum-literal answer from a truth-table minimization", () => {
    expect(semanticError(productionMinimumLiteralQuestion)).toMatch(
      /requires 4 literals/,
    );
  });

  it("rejects an explanation with a false claimed minimum", () => {
    expect(
      semanticError({
        ...productionMinimumLiteralQuestion,
        answer: ["A"],
      }),
    ).toMatch(/explanation claims 3 literals, but the minimum is 4/);
  });

  it("rejects multiple valid Boolean identities", () => {
    expect(semanticError(productionMultipleBooleanIdentities)).toMatch(
      /More than one option is a valid Boolean identity/,
    );
  });

  it("rejects both valid distributive forms in a single-answer question", () => {
    expect(semanticError(productionMultipleDistributiveForms)).toMatch(
      /More than one option is a valid Boolean identity/,
    );
  });

  it("rejects the production answer that is not the Boolean dual", () => {
    expect(semanticError(productionDualQuestion)).toMatch(/keyed answer is not the Boolean dual/);
    expect(semanticError({ ...productionDualQuestion, answer: ["B"] })).toBeNull();
  });

  it("checks the keyed simplification against the expression in the stem", () => {
    expect(semanticError(productionAbsorptionQuestion)).toBeNull();
    expect(
      semanticError({ ...productionAbsorptionQuestion, answer: ["D"] }),
    ).toMatch(/keyed answer is not Boolean-equivalent/);
  });

  it("evaluates a Boolean function at explicit inputs and rejects a wrong key", () => {
    expect(semanticError(productionBooleanEvaluation)).toBeNull();
    expect(
      semanticError({ ...productionBooleanEvaluation, answer: ["A"] }),
    ).toMatch(/keyed answer does not match the Boolean function/);
  });

  it("rejects the production equivalent-expression question with no correct option", () => {
    expect(semanticError(productionLatexWrongExpansion)).toMatch(
      /None of the options is Boolean-equivalent/,
    );
  });

  it("rejects the production simplification question whose choices omit the correct result", () => {
    expect(semanticError(productionEquivalentCorrectOptions)).toMatch(
      /None of the options is Boolean-equivalent/,
    );
  });

  it("rejects multiple equivalent answers expressed in different Boolean forms", () => {
    const multipleCorrect = {
      ...productionEquivalentCorrectOptions,
      text: "Which expression is equivalent to Boolean expression A + B?",
      options: [
        { id: "A", text: "A + B" },
        { id: "B", text: "A + A'B" },
        { id: "C", text: "AB" },
        { id: "D", text: "A'B" },
      ],
      answer: ["A"],
    };
    expect(semanticError(multipleCorrect)).toMatch(
      /More than one option is Boolean-equivalent/,
    );
  });

  it("rejects a wrong combinatorial count and validates its exponent arithmetic", () => {
    expect(semanticError(productionWrongBooleanFunctionCount)).toMatch(
      /number of Boolean functions of 3 variables is 256/,
    );
    expect(
      semanticError({
        ...productionWrongBooleanFunctionCount,
        options: [
          { id: "A", text: "8" },
          { id: "B", text: "256" },
          { id: "C", text: "32" },
          { id: "D", text: "64" },
        ],
        answer: ["B"],
        explanation: "For 3 variables, 2^8 = 128.",
      }),
    ).toMatch(/calculation evaluates to 256, not 128/);
  });

  it("rejects semantically equivalent Boolean distractors", () => {
    const equivalent = {
      ...productionBooleanSimplification,
      text: "Which Boolean expressions are equivalent?",
      options: [
        { id: "A", text: "A + A'" },
        { id: "B", text: "1" },
        { id: "C", text: "A + 0" },
        { id: "D", text: "A . A'" },
      ],
    };
    expect(semanticError(equivalent)).toMatch(/equivalent Boolean expressions/);
  });

  it("rejects numerically equivalent options with different notation", () => {
    const equivalent = {
      kind: "MCQ",
      marks: 2,
      text: "Which value is greater than zero?",
      options: [
        { id: "A", text: "1/2" },
        { id: "B", text: "0.5" },
        { id: "C", text: "-1" },
        { id: "D", text: "0" },
      ],
      answer: ["A"],
      explanation: "One half is greater than zero.",
    };
    expect(semanticError(equivalent)).toMatch(/same numeric value/);
  });

  it("rejects a numerical key that contradicts a directly evaluated stem", () => {
    const calculation = {
      kind: "MCQ",
      marks: 2,
      text: "What is 12 * 4?",
      options: [
        { id: "A", text: "42" },
        { id: "B", text: "48" },
        { id: "C", text: "36" },
        { id: "D", text: "24" },
      ],
      answer: ["A"],
      explanation: "12 * 4 = 48.",
    };
    expect(semanticError(calculation)).toMatch(/calculation evaluates to 48/);
  });

  it("accepts a directly evaluated numerical question with a matching key", () => {
    const calculation = {
      kind: "MCQ",
      marks: 2,
      text: "What is 12 * 4?",
      options: [
        { id: "A", text: "42" },
        { id: "B", text: "48" },
        { id: "C", text: "36" },
        { id: "D", text: "24" },
      ],
      answer: ["B"],
      explanation: "12 * 4 = 48.",
    };
    expect(semanticError(calculation)).toBeNull();
  });

  it("rejects an arithmetic contradiction in the explanation", () => {
    const calculation = {
      kind: "MCQ",
      marks: 2,
      text: "What is 12 * 4?",
      options: [
        { id: "A", text: "48" },
        { id: "B", text: "42" },
        { id: "C", text: "36" },
        { id: "D", text: "24" },
      ],
      answer: ["A"],
      explanation: "12 * 4 = 42.",
    };
    expect(semanticError(calculation)).toMatch(/calculation evaluates to 48, not 42/);
  });
});

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

  it("parses inside the loop, accepts only complete valid kind counts, or stops at the cap", () => {
    expect(source).toMatch(/parsed = parsePracticeQuestions\(reply, context\?\.text\)/);
    expect(source).toContain("parsed.rejected.length === 0");
    expect(source).toContain("mismatch === null");
    expect(source).toContain("generationAttempts >= MAX_GENERATION_ATTEMPTS");
  });

  it("feeds validation and count defects back before regenerating", () => {
    expect(source).toContain("Your reply needs repair");
    expect(source).toContain("question kinds");
    expect(source).toMatch(/role: "assistant", content: reply/);
  });

  it("reports requested and delivered counts for each question kind", () => {
    expect(source).toContain("requestedByKind: config.counts");
    expect(source).toContain("deliveredByKind: practiceQuestionCounts(parsed.questions)");
  });

  it("never wraps generation in an unbounded or timed loop", () => {
    expect(source).not.toMatch(/while\s*\(\s*true\s*\)/);
    expect(source).not.toMatch(/setInterval/);
    expect(source).not.toMatch(/generationAttempts\+\+;\s*\/\/ no cap/);
  });

  describe("requested and delivered question-kind counts", () => {
    it("counts parsed questions and identifies exact per-kind shortfalls", () => {
      const parsed = parsePracticeQuestions(payload([codingCorrect]));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const delivered = practiceQuestionCounts(parsed.questions);
      expect(delivered).toEqual({ MCQ: 1, MSQ: 0, NAT: 0 });
      expect(
        questionCountMismatch({ MCQ: 1, MSQ: 1, NAT: 0 }, delivered),
      ).toBe("MSQ: requested 1, received 0");
    });
  });

  it("reports the attempt count in stats for observability", () => {
    expect(source).toContain("attempts: generationAttempts");
  });
});