/**
 * Practice question generation contract (§9 / core MVP priority 4).
 *
 * Exercises the pure half of generation — the bounded request, the prompt's
 * provenance rules, and the strict parse of model output — entirely from
 * deterministic fixtures. The provider call is deliberately not exercised here:
 * a unit test must not depend on live AI output.
 *
 *   npx vitest run tests/practice.test.ts
 */
import { describe, expect, it } from "vitest";

import {
  AI_GENERATED_LABEL,
  MAX_PRACTICE_QUESTIONS,
  buildPracticePrompt,
  parsePracticeQuestions,
  practiceProvenance,
  questionFingerprint,
  validatePracticeConfig,
  type PracticeConfig,
  type PracticeParseResult,
} from "../src/lib/practice";
import { MAX_QUESTION_TEXT } from "../src/lib/quiz";

/** A valid request; override any field per test. */
function request(over: Record<string, unknown> = {}) {
  return {
    branch: "Computer Science & Information Technology",
    subject: "Operating Systems",
    topic: null,
    difficulty: "medium",
    counts: { MCQ: 1, MSQ: 0, NAT: 0 },
    sourceDocumentId: null,
    ...over,
  };
}

/** Assert a request is accepted, or fail loudly with the reason. */
function accepted(value: unknown): PracticeConfig {
  const verdict = validatePracticeConfig(value);
  if (!verdict.ok) throw new Error(`expected acceptance, got: ${verdict.error}`);
  return verdict.config;
}

/** Assert a request is rejected and return the reason. */
function rejection(value: unknown): string {
  const verdict = validatePracticeConfig(value);
  if (verdict.ok) throw new Error("expected the request to be rejected");
  return verdict.error;
}

/** Assert a reply parses, or fail loudly with the reason. */
function parsed(raw: string): Extract<PracticeParseResult, { ok: true }> {
  const result = parsePracticeQuestions(raw);
  if (!result.ok) {
    throw new Error(`expected a successful parse, got ${result.reason}: ${result.error}`);
  }
  return result;
}

/** Assert a reply fails to parse and return the failure. */
function failed(raw: string): Extract<PracticeParseResult, { ok: false }> {
  const result = parsePracticeQuestions(raw);
  if (result.ok) throw new Error("expected the reply to be rejected");
  return result;
}

const mcq = {
  kind: "MCQ",
  marks: 2,
  text: "Which scheduler is preemptive?",
  options: [
    { id: "A", text: "First come, first served" },
    { id: "B", text: "Round robin" },
  ],
  answer: ["B"],
  explanation: "Round robin preempts the running process at the end of its quantum.",
};

const msq = {
  kind: "MSQ",
  marks: 2,
  text: "Which of these are page-replacement policies?",
  options: [
    { id: "A", text: "LRU" },
    { id: "B", text: "FIFO" },
    { id: "C", text: "Dijkstra's algorithm" },
  ],
  answer: ["A", "B"],
  explanation: "LRU and FIFO evict pages; Dijkstra's algorithm is shortest-path.",
};

const nat = {
  kind: "NAT",
  marks: 1,
  text: "How many bits are in the offset of a 4 KiB page?",
  options: [],
  answer: null,
  nat_range: { min: 12, max: 12 },
  explanation: "log2(4096) = 12.",
};

const payload = (questions: unknown[]) => JSON.stringify({ questions });

describe("practice request — bounds", () => {
  it("accepts a well-formed request and normalises an omitted topic to null", () => {
    const config = accepted(request({ topic: undefined }));
    expect(config.topic).toBeNull();
    expect(config.branch).toBe("Computer Science & Information Technology");
    expect(config.counts).toEqual({ MCQ: 1, MSQ: 0, NAT: 0 });
    expect(config.sourceDocumentId).toBeNull();
  });

  it("trims labels and keeps a supplied topic", () => {
    const config = accepted(request({ subject: "  Operating Systems  ", topic: "  Scheduling  " }));
    expect(config.subject).toBe("Operating Systems");
    expect(config.topic).toBe("Scheduling");
  });

  it("rejects a missing, blank, oversized or non-string branch", () => {
    expect(rejection(request({ branch: undefined }))).toMatch(/Branch is required/);
    expect(rejection(request({ branch: "   " }))).toMatch(/Branch is required/);
    expect(rejection(request({ branch: 7 }))).toMatch(/Branch is required/);
    expect(rejection(request({ branch: "x".repeat(121) }))).toMatch(/Branch is required/);
  });

  it("rejects a missing subject and a blank supplied topic", () => {
    expect(rejection(request({ subject: undefined }))).toMatch(/Subject is required/);
    expect(rejection(request({ topic: "  " }))).toMatch(/Topic must be/);
  });

  it("rejects an unknown difficulty", () => {
    expect(rejection(request({ difficulty: "impossible" }))).toMatch(/Difficulty must be one of/);
    expect(rejection(request({ difficulty: undefined }))).toMatch(/Difficulty must be one of/);
  });

  it("rejects a fractional, negative or oversized count", () => {
    expect(rejection(request({ counts: { MCQ: 1.5, MSQ: 0, NAT: 0 } }))).toMatch(/whole number/);
    expect(rejection(request({ counts: { MCQ: -1, MSQ: 0, NAT: 0 } }))).toMatch(/whole number/);
    expect(rejection(request({ counts: { MCQ: "2", MSQ: 0, NAT: 0 } }))).toMatch(/whole number/);
    const huge = { MCQ: MAX_PRACTICE_QUESTIONS + 1, MSQ: 0, NAT: 0 };
    expect(rejection(request({ counts: huge }))).toMatch(/At most/);
  });

  it("rejects a request that asks for nothing at all", () => {
    expect(rejection(request({ counts: { MCQ: 0, MSQ: 0, NAT: 0 } }))).toMatch(/at least one/);
  });

  it("rejects a total above the per-request cap even when each count is allowed", () => {
    // 13 + 13 is under the per-kind cap but over the request cap.
    const counts = { MCQ: 13, MSQ: 13, NAT: 0 };
    expect(rejection(request({ counts }))).toMatch(/At most 25 questions per request/);
  });

  it("accepts a well-formed UUID source document id and rejects a malformed one", () => {
    const id = "6f1c0a2e-8f4b-4c2a-9d3e-1b2c3d4e5f60";
    expect(accepted(request({ sourceDocumentId: id })).sourceDocumentId).toBe(id);
    expect(rejection(request({ sourceDocumentId: "not-a-uuid" }))).toMatch(/must be a UUID/);
  });

  it("rejects a non-object request", () => {
    expect(rejection(null)).toMatch(/must be an object/);
    expect(rejection([])).toMatch(/must be an object/);
  });
});

describe("practice prompt — provenance and bounds", () => {
  it("names the requested mix, subject, topic and difficulty", () => {
    const prompt = buildPracticePrompt(
      accepted(request({ topic: "Scheduling", counts: { MCQ: 3, MSQ: 2, NAT: 1 } })),
    );
    expect(prompt).toContain("3 × MCQ, 2 × MSQ, 1 × NAT");
    expect(prompt).toContain("Subject: Operating Systems");
    expect(prompt).toContain("Topic: Scheduling");
    expect(prompt).toContain("Difficulty: medium");
  });

  it("falls back to any-topic when no topic was chosen", () => {
    expect(buildPracticePrompt(accepted(request()))).toContain("any topic within the subject");
  });

  it("forbids official provenance and invented citations", () => {
    const prompt = buildPracticePrompt(accepted(request()));
    expect(prompt).toContain("not official GATE questions");
    expect(prompt).toContain("Never claim or imply official provenance");
    expect(prompt).toContain("Never invent references");
  });

  it("asks for grounding only when a document was actually supplied", () => {
    expect(buildPracticePrompt(accepted(request()))).toContain("Not tied to any source document.");
    const grounded = buildPracticePrompt(
      accepted(request({ sourceDocumentId: "6f1c0a2e-8f4b-4c2a-9d3e-1b2c3d4e5f60" })),
    );
    expect(grounded).toContain("Ground the questions in the source document");
  });

  it("bounds question text by the quiz module's own limit", () => {
    expect(buildPracticePrompt(accepted(request()))).toContain(String(MAX_QUESTION_TEXT));
  });

  it("is deterministic for the same config", () => {
    const config = accepted(request());
    expect(buildPracticePrompt(config)).toBe(buildPracticePrompt(config));
  });
});

describe("practice parse — well-formed output", () => {
  it("parses an MCQ, MSQ and NAT payload and preserves each key", () => {
    const result = parsed(payload([mcq, msq, nat]));
    expect(result.questions).toHaveLength(3);
    expect(result.rejected).toEqual([]);
    expect(result.duplicates).toBe(0);
    expect(result.truncated).toBe(0);

    const [first, second, third] = result.questions;
    expect(first.kind).toBe("MCQ");
    expect(first.answer).toEqual(["B"]);
    expect(second.kind).toBe("MSQ");
    expect(second.answer).toEqual(["A", "B"]);
    expect(third.kind).toBe("NAT");
    expect(third.options).toEqual([]);
    expect(third.answer).toBeNull();
    expect(third.nat_range).toEqual({ min: 12, max: 12 });
  });

  it("accepts a bare top-level array as well as the wrapped object", () => {
    expect(parsed(JSON.stringify([mcq, nat])).questions).toHaveLength(2);
    expect(parsed(payload([mcq, nat])).questions).toHaveLength(2);
  });

  it("tolerates a code fence and a sentence of preamble", () => {
    const fenced = "Here are your questions:\n```json\n" + payload([mcq, nat]) + "\n```\nGood luck!";
    expect(parsed(fenced).questions).toHaveLength(2);
  });

  it("keeps an explanation when the model supplies one", () => {
    expect(parsed(payload([mcq])).questions[0].explanation).toContain("quantum");
  });
});

describe("practice parse — unusable replies", () => {
  it("fails an empty reply as empty_response, not as an empty success", () => {
    expect(failed("").reason).toBe("empty_response");
    expect(failed("   \n  ").reason).toBe("empty_response");
  });

  it("fails prose with no JSON as malformed_json", () => {
    expect(failed("I cannot help with that request.").reason).toBe("malformed_json");
  });

  it("fails a payload with no questions array", () => {
    expect(failed(JSON.stringify({ ok: true })).reason).toBe("malformed_json");
    expect(failed(JSON.stringify({})).reason).toBe("malformed_json");
  });

  it("fails a non-array questions value", () => {
    expect(failed(JSON.stringify({ questions: 5 })).reason).toBe("malformed_json");
    expect(failed(JSON.stringify({ questions: { 0: mcq } })).reason).toBe("malformed_json");
  });

  it("never mistakes a provider error body for generated questions", () => {
    // A transport/provider failure can arrive as valid JSON. It must fail the
    // parse, so a caller can never render it as "the model returned no
    // questions" instead of "the provider failed".
    expect(failed(JSON.stringify({ error: "rate_limited" })).reason).toBe("malformed_json");
    expect(failed(JSON.stringify({ error: "provider_unavailable", retry_after: 30 })).reason).toBe(
      "malformed_json",
    );
  });

  it("fails with no_valid_questions when every entry is rejected", () => {
    const broken = { ...mcq, answer: ["Z"] };
    const result = failed(payload([broken, broken]));
    expect(result.reason).toBe("no_valid_questions");
    expect(result.error).toMatch(/None of the 2 returned questions were usable/);
  });
});

describe("practice parse — per-entry rejection", () => {
  it("drops a question with no answer but keeps the usable ones, reporting the index", () => {
    const noAnswer = { ...mcq, answer: undefined };
    const result = parsed(payload([mcq, noAnswer, nat]));
    expect(result.questions).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].index).toBe(1);
    expect(result.rejected[0].error).toMatch(/at least one answer id/);
  });

  it("drops an answer id that is not among the question's options", () => {
    const result = parsed(payload([{ ...mcq, answer: ["Z"] }, nat]));
    expect(result.questions).toHaveLength(1);
    expect(result.rejected[0].error).toMatch(/must match one of the question's options/);
  });

  it("drops duplicate option ids", () => {
    const dupes = {
      ...mcq,
      options: [
        { id: "A", text: "one" },
        { id: "A", text: "two" },
      ],
    };
    expect(parsed(payload([dupes, nat])).rejected[0].error).toMatch(/Duplicate option id/);
  });

  it("drops a question with fewer than two options", () => {
    const single = { ...mcq, options: [{ id: "A", text: "only" }] };
    expect(parsed(payload([single, nat])).rejected[0].error).toMatch(/at least two options/);
  });

  it("drops an MCQ carrying two answers, and keeps a genuine MSQ", () => {
    const twoAnswers = { ...mcq, answer: ["A", "B"] };
    const result = parsed(payload([twoAnswers, msq]));
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].kind).toBe("MSQ");
    expect(result.rejected[0].error).toMatch(/exactly one answer/);
  });

  it("drops a question with blank text", () => {
    expect(parsed(payload([{ ...mcq, text: "   " }, nat])).rejected[0].error).toMatch(
      /Question text is required/,
    );
  });

  it("drops a NAT question that carries options", () => {
    const withOptions = { ...nat, options: [{ id: "A", text: "x" }] };
    expect(parsed(payload([withOptions, mcq])).rejected[0].error).toMatch(
      /must not carry options/,
    );
  });

  it("drops a NAT question whose range is inverted", () => {
    const inverted = { ...nat, nat_range: { min: 5, max: 1 } };
    expect(parsed(payload([inverted, mcq])).rejected[0].error).toMatch(/min <= max/);
  });

  it("drops a non-object entry", () => {
    expect(parsed(payload(["not a question", mcq])).rejected[0].error).toMatch(
      /must be an object/,
    );
  });
});

describe("practice parse — duplicates and cap", () => {
  it("counts a repeated question and keeps the first one", () => {
    const result = parsed(payload([mcq, mcq]));
    expect(result.questions).toHaveLength(1);
    expect(result.duplicates).toBe(1);
    expect(result.rejected).toEqual([]);
  });

  it("treats whitespace and case variants as the same question", () => {
    const variant = { ...mcq, text: "  which SCHEDULER   is preemptive? " };
    const result = parsed(payload([mcq, variant]));
    expect(result.duplicates).toBe(1);
    expect(result.questions).toHaveLength(1);
  });

  it("keeps the same text under a different kind as a distinct question", () => {
    const asMsq = { ...mcq, kind: "MSQ", answer: ["A", "B"] };
    const result = parsed(payload([mcq, asMsq]));
    expect(result.questions).toHaveLength(2);
    expect(result.duplicates).toBe(0);
  });

  it("caps at the per-request maximum and reports the overflow", () => {
    const many = Array.from({ length: MAX_PRACTICE_QUESTIONS + 5 }, (_, i) => ({
      ...mcq,
      text: `Generated question number ${i}`,
    }));
    const result = parsed(payload(many));
    expect(result.questions).toHaveLength(MAX_PRACTICE_QUESTIONS);
    expect(result.truncated).toBe(5);
  });

  it("fingerprints by kind and normalised text", () => {
    const a = parsed(payload([mcq])).questions[0];
    const b = parsed(payload([{ ...mcq, text: " which scheduler IS preemptive? " }])).questions[0];
    expect(questionFingerprint(a)).toBe(questionFingerprint(b));
    expect(questionFingerprint(a)).toMatch(/^MCQ:/);
  });
});

describe("practice provenance", () => {
  it("labels generated questions as AI-generated, never as official", () => {
    const provenance = practiceProvenance(accepted(request()));
    expect(provenance.source).toBe("ai_generated");
    expect(provenance.label).toBe(AI_GENERATED_LABEL);
    expect(provenance.label).not.toMatch(/official/i);
  });

  it("records a source document only when one was genuinely supplied", () => {
    expect(practiceProvenance(accepted(request())).source_document_id).toBeNull();
    const id = "6f1c0a2e-8f4b-4c2a-9d3e-1b2c3d4e5f60";
    expect(practiceProvenance(accepted(request({ sourceDocumentId: id }))).source_document_id).toBe(id);
  });
});