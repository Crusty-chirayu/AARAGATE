/**
 * Security: the practice answer key must never reach the browser.
 *
 * The flagged concern was concrete: the practice screen's Supabase path held
 * generated questions (key included) client-side and persisted them from the
 * browser. This suite pins the invariant that replaced it — generation returns
 * an attempt id and no question payload at all, the server owns the keyed
 * snapshot, and the client cannot write one.
 *
 * Deterministic and network-free: the Supabase client is mocked. No live AI.
 *
 *   npx vitest run tests/practice-security.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSupabaseBrowser } = vi.hoisted(() => ({ mockGetSupabaseBrowser: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowser: mockGetSupabaseBrowser }));
// Supabase mode, not demo mode: this is the path that talks to the server.
vi.mock("@/lib/env", () => ({ DEMO_MODE: false }));

import { generatePaper } from "@/lib/data/generation";
import { createAttempt } from "@/lib/data/attempts";
import { publicAttempt, type AttemptQuestion, type QuizAttempt } from "@/lib/attempts";

const config = {
  branch: "Computer Science & Information Technology",
  subject: "Operating Systems",
  topic: null,
  difficulty: "medium" as const,
  counts: { MCQ: 1, MSQ: 0, NAT: 0 },
  sourceDocumentId: null,
};

/** A question exactly as a paper stores it: key fields present. */
function keyedQuestion(): AttemptQuestion {
  return {
    kind: "MCQ",
    marks: 2,
    text: "Which scheduler is preemptive?",
    options: [
      { id: "A", text: "First come, first served" },
      { id: "B", text: "Round robin" },
    ],
    answer: ["B"],
    nat_range: null,
    explanation: "Round robin preempts the running process at the end of its quantum.",
    index: 0,
    subject: "Operating Systems",
    topic: null,
    difficulty: "medium",
    provenance: "ai_generated",
  };
}

function attemptWithKey(): QuizAttempt {
  return {
    id: "att-1",
    branch: config.branch,
    subject: config.subject,
    topic: null,
    difficulty: "medium",
    sourceDocumentId: null,
    created_at: "2026-01-01T00:00:00.000Z",
    submitted_at: null,
    questions: [keyedQuestion()],
  };
}

beforeEach(() => {
  mockGetSupabaseBrowser.mockReset();
});

describe("the generation reply cannot deliver a key", () => {
  beforeEach(() => {
    mockGetSupabaseBrowser.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      functions: {
        // The worst case: a reply that carries full keyed questions.
        invoke: async () => ({
          data: {
            attemptId: "att-9",
            questions: [keyedQuestion()],
            grounded: false,
            stats: { requested: 1, delivered: 1, rejected: 0 },
          },
          error: null,
        }),
      },
    });
  });

  it("returns an attempt id and nothing else", async () => {
    const paper = await generatePaper(config);

    expect(paper.attemptId).toBe("att-9");
    expect(Object.keys(paper).sort()).toEqual(["attemptId", "grounded", "shortfallNote"]);
  });

  it("carries no question text, answer id or explanation in its payload", async () => {
    const serialised = JSON.stringify(await generatePaper(config));

    expect(serialised).not.toContain("Which scheduler is preemptive?");
    expect(serialised).not.toContain("Round robin preempts");
    expect(serialised).not.toContain("nat_range");
  });
});

describe("the browser cannot persist a keyed snapshot", () => {
  it("createAttempt refuses in Supabase mode", async () => {
    await expect(createAttempt(attemptWithKey())).rejects.toThrow(/server-side/i);
  });
});

describe("the pre-submission view of an attempt", () => {
  it("removes the key fields from every question rather than blanking them", () => {
    const view = publicAttempt(attemptWithKey());
    const question = view.questions[0] as unknown as Record<string, unknown>;

    // Own-property check: a spread-and-blank implementation would leave the
    // names present, which a later spread or serialiser could pick back up.
    expect(Object.keys(question)).not.toContain("answer");
    expect(Object.keys(question)).not.toContain("nat_range");
    expect(Object.keys(question)).not.toContain("explanation");
  });

  it("serialises to a payload containing no key material", () => {
    const serialised = JSON.stringify(publicAttempt(attemptWithKey()));

    expect(serialised).not.toContain('"answer"');
    expect(serialised).not.toContain("Round robin preempts");
  });

  it("exposes no score, verdict or response before submission", () => {
    const view = publicAttempt(attemptWithKey()) as unknown as Record<string, unknown>;

    expect(Object.keys(view)).not.toContain("result");
    expect(Object.keys(view)).not.toContain("verdicts");
    expect(Object.keys(view)).not.toContain("responses");
  });

  it("still carries what a student needs to answer the question", () => {
    const question = publicAttempt(attemptWithKey()).questions[0];

    expect(question.kind).toBe("MCQ");
    expect(question.text).toBe("Which scheduler is preemptive?");
    expect(question.marks).toBe(2);
    expect(question.options).toHaveLength(2);
    expect(question.provenance).toBe("ai_generated");
    expect(question.index).toBe(0);
  });
});
