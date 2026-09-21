/**
 * Demo paper assembly + attempt scoring round-trip (core MVP practice path).
 *
 * Non-trivial because a wrong paper shape here would silently shorten a
 * student's paper or mis-score it; the checks pin the two load-bearing
 * properties: short papers say exactly what was missing, and answering from
 * the sample bank grades through the same GATE-rules engine the review
 * screen reads.
 *
 *   npx vitest run tests/sample-paper.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  gradeAttempt,
  publicAttempt,
  type QuizAttempt,
} from "../src/lib/attempts";
import { samplePaper, shortfallNote } from "../src/lib/data/practice";
import { UNANSWERED } from "../src/lib/quiz";

function config(over: Record<string, unknown> = {}) {
  return {
    branch: "Computer Science",
    subject: "Data Structures & Algorithms",
    topic: null,
    difficulty: "mixed",
    counts: { MCQ: 2, MSQ: 0, NAT: 0 },
    sourceDocumentId: null,
    ...over,
  } as Parameters<typeof samplePaper>[0];
}

describe("samplePaper", () => {
  it("builds a reproducible paper from the sample bank", () => {
    const first = samplePaper(config());
    const second = samplePaper(config());
    expect(first.questions.length).toBe(2);
    expect(first.provenance).toBe("sample");
    expect(first.questions.map((q) => q.text)).toEqual(
      second.questions.map((q) => q.text),
    );
  });

  it("reports the shortfall instead of silently shortening the paper", () => {
    const paper = samplePaper(config({ counts: { MCQ: 99, MSQ: 0, NAT: 0 } }));
    expect(paper.shortfall.MCQ).toMatchObject({ requested: 99 });
    expect(shortfallNote(paper.shortfall)).toContain("MCQ");
  });
});

describe("attempt round-trip", () => {
  it("hides the key before submission and scores GATE rules after", () => {
    const paper = samplePaper(config());
    const attempt: QuizAttempt = {
      id: "paper-1",
      branch: "Computer Science",
      subject: "Data Structures & Algorithms",
      topic: null,
      difficulty: "mixed",
      sourceDocumentId: null,
      created_at: new Date().toISOString(),
      questions: paper.questions,
    };

    for (const q of publicAttempt(attempt).questions) {
      expect(q).not.toHaveProperty("answer");
      expect(q).not.toHaveProperty("nat_range");
      expect(q).not.toHaveProperty("explanation");
    }

    const key = paper.questions[0].answer ?? [];
    const { attempt: graded, result } = gradeAttempt(
      attempt,
      { 0: { kind: "options", selected: [...key] }, 1: UNANSWERED },
      new Date().toISOString(),
    );
    expect(result.correct).toBe(1);
    expect(result.unanswered).toBe(1);
    expect(graded.result?.awarded).toBe(result.awarded);
  });
});