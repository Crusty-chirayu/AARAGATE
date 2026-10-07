import { describe, expect, it } from "vitest";
import { restoreAttemptResponses, type PublicQuestion } from "../src/lib/attempts";

const questions: PublicQuestion[] = [
  {
    index: 0,
    kind: "MCQ",
    marks: 1,
    text: "Question one?",
    options: [
      { id: "A", text: "First" },
      { id: "B", text: "Second" },
    ],
    subject: "Networks",
    topic: null,
    difficulty: "medium",
    provenance: "ai_generated",
  },
  {
    index: 1,
    kind: "NAT",
    marks: 1,
    text: "Question two?",
    options: [],
    subject: "Networks",
    topic: null,
    difficulty: "medium",
    provenance: "ai_generated",
  },
];

describe("restoreAttemptResponses", () => {
  it("restores valid option and numeric answers", () => {
    expect(
      restoreAttemptResponses(
        JSON.stringify({
          0: { kind: "options", selected: ["B"] },
          1: { kind: "numeric", value: 8 },
        }),
        questions,
      ),
    ).toEqual({
      0: { kind: "options", selected: ["B"] },
      1: { kind: "numeric", value: 8 },
    });
  });

  it("returns an empty map when there are no saved answers", () => {
    expect(restoreAttemptResponses(null, questions)).toEqual({});
  });

  it("rejects malformed, duplicate, unknown, or wrong-kind responses", () => {
    expect(() => restoreAttemptResponses("{", questions)).toThrow();
    expect(() => restoreAttemptResponses("[]", questions)).toThrow(/object/i);
    expect(
      () =>
        restoreAttemptResponses(
          JSON.stringify({ 0: { kind: "options", selected: ["A", "A"] } }),
          questions,
        ),
    ).toThrow(/malformed/i);
    expect(
      () =>
        restoreAttemptResponses(
          JSON.stringify({ 0: { kind: "options", selected: ["Z"] } }),
          questions,
        ),
    ).toThrow(/malformed/i);
    expect(
      () => restoreAttemptResponses(JSON.stringify({ 0: { kind: "numeric", value: 2 } }), questions),
    ).toThrow(/does not match/i);
  });
});
