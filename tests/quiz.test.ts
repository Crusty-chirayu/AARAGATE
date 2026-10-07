/**
 * Core MVP priorities 5 and 6 — question validation and quiz scoring.
 *
 * The two halves are tested together because they share one contract:
 * `validateQuestion` decides what a question *is*, and `scoreQuestion`
 * decides what an answer is *worth*. Scoring rules are the product spec
 * (MCQ wrong = -marks/3, MSQ exact set, NAT numeric range, unanswered
 * always 0), so they are pinned numerically rather than by shape.
 *
 *   npx vitest run tests/quiz.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  MCQ_PENALTY_DIVISOR,
  formatMarks,
  roundMarks,
  scoreQuestion,
  scoreQuiz,
  validateQuestion,
  type Question,
  type Response,
} from "../src/lib/quiz";

/** Build a valid question, then let each test override the parts it cares about. */
function raw(overrides: Record<string, unknown> = {}) {
  return {
    kind: "MCQ",
    marks: 2,
    text: "Which normal form removes transitive dependencies?",
    options: [
      { id: "A", text: "1NF" },
      { id: "B", text: "2NF" },
      { id: "C", text: "3NF" },
      { id: "D", text: "BCNF" },
    ],
    answer: ["C"],
    explanation: "3NF removes transitive dependencies.",
    ...overrides,
  };
}

/** Assert validation succeeded and hand back the parsed question. */
function parsed(value: unknown): Question {
  const verdict = validateQuestion(value);
  if (!verdict.ok) throw new Error(`expected a valid question, got: ${verdict.error}`);
  return verdict.question;
}

function errorOf(value: unknown): string {
  const verdict = validateQuestion(value);
  if (verdict.ok) throw new Error("expected validation to fail");
  return verdict.error;
}

describe("validateQuestion — accepts well-formed questions", () => {
  it("accepts a complete MCQ", () => {
    const q = parsed(raw());
    expect(q.kind).toBe("MCQ");
    expect(q.marks).toBe(2);
    expect(q.options).toHaveLength(4);
    expect(q.answer).toEqual(["C"]);
    expect(q.nat_range).toBeNull();
  });

  it("accepts an MSQ with several keyed options", () => {
    const q = parsed(raw({ kind: "MSQ", answer: ["A", "C"] }));
    expect(q.kind).toBe("MSQ");
    expect(q.answer).toEqual(["A", "C"]);
  });

  it("accepts a NAT with an inclusive range and no options", () => {
    const q = parsed({
      kind: "NAT",
      marks: 1,
      text: "How many bits are in a byte?",
      options: [],
      nat_range: { min: 8, max: 8 },
    });
    expect(q.options).toEqual([]);
    expect(q.answer).toBeNull();
    expect(q.nat_range).toEqual({ min: 8, max: 8 });
  });

  it("trims text and defaults a missing explanation to null", () => {
    const q = parsed(raw({ text: "  spaced  ", explanation: undefined }));
    expect(q.text).toBe("spaced");
    expect(q.explanation).toBeNull();
  });

  it("de-duplicates repeated answer ids", () => {
    const q = parsed(raw({ kind: "MSQ", answer: ["A", "A", "C"] }));
    expect(q.answer).toEqual(["A", "C"]);
  });
});

describe("validateQuestion — rejects unusable questions", () => {
  it("rejects a non-object and an unknown kind", () => {
    expect(errorOf(null)).toMatch(/object/i);
    expect(errorOf(raw({ kind: "TRUE_FALSE" }))).toMatch(/MCQ, MSQ or NAT/);
  });

  it("rejects marks that are non-numeric, zero, negative or absurd", () => {
    expect(errorOf(raw({ marks: "2" }))).toMatch(/marks/i);
    expect(errorOf(raw({ marks: 0 }))).toMatch(/marks/i);
    expect(errorOf(raw({ marks: -1 }))).toMatch(/marks/i);
    expect(errorOf(raw({ marks: Number.NaN }))).toMatch(/marks/i);
    expect(errorOf(raw({ marks: 999 }))).toMatch(/marks/i);
    expect(errorOf(raw({ marks: 0.075 }))).toMatch(/marks/i);
  });

  it("rejects missing or blank question text", () => {
    expect(errorOf(raw({ text: undefined }))).toMatch(/text/i);
    expect(errorOf(raw({ text: "   " }))).toMatch(/text/i);
  });

  it("rejects an MCQ that keys more than one answer", () => {
    expect(errorOf(raw({ kind: "MCQ", answer: ["A", "B"] }))).toMatch(/exactly one/i);
  });

  it("rejects an answer id that is not one of the options", () => {
    expect(errorOf(raw({ answer: ["Z"] }))).toMatch(/match one of/i);
  });

  it("rejects option ids outside the A–H contract", () => {
    expect(
      errorOf(
        raw({
          options: [
            { id: "Z", text: "one" },
            { id: "B", text: "two" },
          ],
          answer: ["Z"],
        }),
      ),
    ).toMatch(/A–H/i);
  });

  it("rejects too few options and duplicate option ids", () => {
    expect(errorOf(raw({ options: [{ id: "A", text: "only" }] }))).toMatch(/two options/i);
    expect(
      errorOf(
        raw({
          options: [
            { id: "A", text: "x" },
            { id: "A", text: "y" },
          ],
          answer: ["A"],
        }),
      ),
    ).toMatch(/duplicate/i);
  });

  it("rejects option text duplicated only by letter case", () => {
    expect(
      errorOf(
        raw({
          options: [
            { id: "A", text: "3NF" },
            { id: "B", text: "3nf" },
          ],
        }),
      ),
    ).toMatch(/duplicate option text/i);
  });

  it("rejects an option with no text or a missing answer", () => {
    expect(errorOf(raw({ options: [{ id: "A", text: "x" }, { id: "B", text: "" }] }))).toMatch(/needs text/i);
    expect(errorOf(raw({ answer: [] }))).toMatch(/at least one answer/i);
  });

  it("rejects a NAT with an inverted or missing range", () => {
    expect(errorOf({ kind: "NAT", marks: 1, text: "n?", nat_range: { min: 5, max: 1 } })).toMatch(
      /min <= max/,
    );
    expect(errorOf({ kind: "NAT", marks: 1, text: "n?" })).toMatch(/numeric range/i);
  });

  it("rejects a NAT carrying options", () => {
    expect(
      errorOf({
        kind: "NAT",
        marks: 1,
        text: "n?",
        options: [{ id: "A", text: "x" }],
        nat_range: { min: 0, max: 1 },
      }),
    ).toMatch(/must not carry options/i);
  });
});

describe("scoreQuestion — MCQ", () => {
  const q = parsed(raw({ marks: 2 }));

  it("awards the full marks for the right option", () => {
    expect(scoreQuestion(q, { kind: "options", selected: ["C"] })).toEqual({
      outcome: "correct",
      awarded: 2,
      max: 2,
    });
  });

  it("applies a negative penalty of one third of the marks", () => {
    expect(scoreQuestion(q, { kind: "options", selected: ["A"] })).toEqual({
      outcome: "wrong",
      awarded: roundMarks(-2 / MCQ_PENALTY_DIVISOR),
      max: 2,
    });
    // 2 marks -> -0.67, not -0.6666666666666666.
    expect(scoreQuestion(q, { kind: "options", selected: ["A"] }).awarded).toBe(-0.67);
  });

  it("scales the penalty with the question's marks", () => {
    expect(scoreQuestion(parsed(raw({ marks: 1 })), { kind: "options", selected: ["D"] }).awarded).toBe(
      -0.33,
    );
    expect(scoreQuestion(parsed(raw({ marks: 3 })), { kind: "options", selected: ["D"] }).awarded).toBe(-1);
  });

  it("treats a multi-select on an MCQ as wrong, never correct", () => {
    expect(scoreQuestion(q, { kind: "options", selected: ["C", "D"] }).outcome).toBe("wrong");
  });

  it("does not penalise an empty selection or an explicit skip", () => {
    expect(scoreQuestion(q, { kind: "options", selected: [] })).toEqual({
      outcome: "unanswered",
      awarded: 0,
      max: 2,
    });
    expect(scoreQuestion(q, { kind: "unanswered" })).toEqual({
      outcome: "unanswered",
      awarded: 0,
      max: 2,
    });
  });

  it("never lets a skip score worse than a wrong answer", () => {
    const skipped = scoreQuestion(q, { kind: "unanswered" }).awarded;
    const wrong = scoreQuestion(q, { kind: "options", selected: ["A"] }).awarded;
    expect(skipped).toBeGreaterThan(wrong);
  });
});

describe("roundMarks", () => {
  it("rounds negative half-cent values away from zero to match PostgreSQL", () => {
    expect(roundMarks(-0.025)).toBe(-0.03);
    expect(roundMarks(0.025)).toBe(0.03);
  });
});

describe("scoreQuestion — MSQ is an exact set match", () => {
  const q = parsed(raw({ kind: "MSQ", marks: 3, answer: ["A", "C"] }));

  it("awards full marks only for the exact keyed set", () => {
    expect(scoreQuestion(q, { kind: "options", selected: ["A", "C"] })).toEqual({
      outcome: "correct",
      awarded: 3,
      max: 3,
    });
    // Order must not matter.
    expect(scoreQuestion(q, { kind: "options", selected: ["C", "A"] }).outcome).toBe("correct");
  });

  it("scores a partial selection as wrong with no negative marking", () => {
    const verdict = scoreQuestion(q, { kind: "options", selected: ["A"] });
    expect(verdict.outcome).toBe("wrong");
    expect(verdict.awarded).toBe(0);
  });

  it("scores a superset as wrong with no negative marking", () => {
    const verdict = scoreQuestion(q, { kind: "options", selected: ["A", "B", "C"] });
    expect(verdict.outcome).toBe("wrong");
    expect(verdict.awarded).toBe(0);
  });

  it("does not treat duplicate selections as an exact set match", () => {
    const verdict = scoreQuestion(q, { kind: "options", selected: ["A", "A"] });
    expect(verdict.outcome).toBe("wrong");
    expect(verdict.awarded).toBe(0);
  });

  it("does not penalise an MSQ skip", () => {
    expect(scoreQuestion(q, { kind: "unanswered" }).awarded).toBe(0);
  });
});

describe("scoreQuestion — NAT uses an inclusive numeric range", () => {
  const q = parsed({ kind: "NAT", marks: 2, text: "value?", nat_range: { min: 8, max: 8 } });
  const ranged = parsed({ kind: "NAT", marks: 2, text: "value?", nat_range: { min: -1.5, max: 1.5 } });

  it("accepts a value inside the range and rejects one outside", () => {
    expect(scoreQuestion(q, { kind: "numeric", value: 8 }).awarded).toBe(2);
    expect(scoreQuestion(q, { kind: "numeric", value: 8.0001 }).outcome).toBe("wrong");
  });

  it("includes both endpoints", () => {
    expect(scoreQuestion(ranged, { kind: "numeric", value: -1.5 }).outcome).toBe("correct");
    expect(scoreQuestion(ranged, { kind: "numeric", value: 1.5 }).outcome).toBe("correct");
    expect(scoreQuestion(ranged, { kind: "numeric", value: 1.5001 }).outcome).toBe("wrong");
  });

  it("never applies a negative penalty", () => {
    expect(scoreQuestion(q, { kind: "numeric", value: 42 }).awarded).toBe(0);
    expect(scoreQuestion(q, { kind: "numeric", value: 42 }).outcome).toBe("wrong");
  });

  it("treats a skip as unanswered and a NaN as wrong-with-zero", () => {
    expect(scoreQuestion(q, { kind: "unanswered" })).toEqual({
      outcome: "unanswered",
      awarded: 0,
      max: 2,
    });
    expect(scoreQuestion(q, { kind: "numeric", value: Number.NaN }).awarded).toBe(0);
  });
});

describe("scoreQuestion — mismatched response kinds are not penalised", () => {
  const mcq = parsed(raw());
  const nat = parsed({ kind: "NAT", marks: 1, text: "n?", nat_range: { min: 0, max: 1 } });

  it("treats a numeric reply to an option question as unanswered", () => {
    expect(scoreQuestion(mcq, { kind: "numeric", value: 1 })).toEqual({
      outcome: "unanswered",
      awarded: 0,
      max: 2,
    });
  });

  it("treats an option reply to a NAT question as unanswered", () => {
    expect(scoreQuestion(nat, { kind: "options", selected: ["A"] })).toEqual({
      outcome: "unanswered",
      awarded: 0,
      max: 1,
    });
  });
});
