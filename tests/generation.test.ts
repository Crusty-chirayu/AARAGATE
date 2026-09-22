/**
 * AI-paper assembly for the practice screen (`src/lib/data/generation.ts`).
 *
 * Deterministic and network-free: the Supabase client is mocked, so every
 * Edge Function reply — success, shortfall, moderation, provider failure,
 * malformed payload — is a fixture. No live AI is ever invoked here.
 *
 *   npx vitest run tests/generation.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generatePaper,
  generationErrorInfo,
  generationShortfallNote,
  validatedQuestions,
} from "../src/lib/data/generation";

const { mockGetSupabaseBrowser } = vi.hoisted(() => ({ mockGetSupabaseBrowser: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowser: mockGetSupabaseBrowser }));

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

const malformed = {
  kind: "MCQ",
  marks: 2,
  text: "A question whose answer id is not among its options.",
  options: [{ id: "A", text: "only" }],
  answer: ["Z"],
  explanation: "Unusable — must be rejected, never repaired.",
};

const config = {
  branch: "Computer Science & Information Technology",
  subject: "Operating Systems",
  topic: null,
  difficulty: "medium" as const,
  counts: { MCQ: 1, MSQ: 0, NAT: 0 },
  sourceDocumentId: null,
};

function authed(invoke: (...args: never[]) => Promise<unknown>) {
  mockGetSupabaseBrowser.mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    functions: { invoke },
  });
}

function httpError(status: number, body: unknown) {
  return {
    context: new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  };
}

async function codeOf(promise: Promise<unknown>): Promise<{ code: string; detail: string | null }> {
  try {
    await promise;
  } catch (thrown) {
    return thrown as { code: string; detail: string | null };
  }
  throw new Error("expected the promise to reject");
}

beforeEach(() => {
  mockGetSupabaseBrowser.mockReset();
});

describe("validatedQuestions — the server's reply is untrusted input", () => {
  it("accepts a well-formed question and rejects a malformed one with a count", () => {
    const { questions, rejected } = validatedQuestions([mcq, malformed]);
    expect(questions).toHaveLength(1);
    expect(rejected).toBe(1);
  });

  it("treats a non-array payload as zero questions, not a crash", () => {
    expect(validatedQuestions(null)).toEqual({ questions: [], rejected: 0 });
    expect(validatedQuestions({})).toEqual({ questions: [], rejected: 0 });
  });
});

describe("generationShortfallNote — honest shortfall", () => {
  it("returns null when the request was fully met", () => {
    expect(generationShortfallNote(2, 2, 0)).toBeNull();
    expect(generationShortfallNote(1, 1, 1)).toBeNull();
  });

  it("names the shortfall and the malformed count", () => {
    const note = generationShortfallNote(3, 1, 1);
    expect(note).toMatch(/asked for 3/);
    expect(note).toMatch(/1 rejected as malformed/);
  });
});

describe("generationErrorInfo — user-safe failure copy", () => {
  it("maps every known failure code to an actionable title", () => {
    expect(generationErrorInfo({ code: "sign_in", detail: null }).title).toMatch(/Sign in/);
    expect(generationErrorInfo({ code: "moderation_blocked", detail: null }).title).toMatch(/blocked/);
    expect(generationErrorInfo({ code: "no_valid_questions", detail: null }).title).toMatch(
      /No usable/,
    );
    expect(generationErrorInfo({ code: "provider_error", detail: null }).title).toMatch(/model/);
    expect(generationErrorInfo({ code: "network", detail: null }).title).toMatch(/reach/);
  });

  it("passes the server's validation detail through for invalid_config", () => {
    const info = generationErrorInfo({ code: "invalid_config", detail: "Counts must give…" });
    expect(info.description).toBe("Counts must give…");
  });

  it("falls back to a generic message for unknown failures", () => {
    expect(generationErrorInfo({ code: "mystery", detail: null }).title).toBe("Generation failed");
    expect(generationErrorInfo(null).title).toBe("Generation failed");
  });
});

describe("generatePaper — request and response contract", () => {
  it("sends only the validated config to the practice-generator function", async () => {
    const rawCalls: unknown[][] = [];
    authed(async (...args: unknown[]) => {
      rawCalls.push(args);
      return { data: { questions: [mcq], stats: { requested: 1 }, grounded: false }, error: null };
    });
    const paper = await generatePaper(config);
    expect(rawCalls[0][0]).toBe("practice-generator");
    expect((rawCalls[0][1] as { body: { config: unknown } }).body.config).toEqual(config);
    expect(paper.questions).toHaveLength(1);
  });

  it("returns an ai_generated paper with no shortfall when fully met", async () => {
    authed(async () => ({
      data: { questions: [mcq], stats: { requested: 1 }, grounded: false },
      error: null,
    }));
    const paper = await generatePaper(config);
    expect(paper.provenance).toBe("ai_generated");
    expect(paper.shortfallNote).toBeNull();
    expect(paper.grounded).toBe(false);
  });

  it("preserves provenance and reports a shortfall on partial delivery", async () => {
    authed(async () => ({
      data: { questions: [mcq], stats: { requested: 3, rejected: 2 }, grounded: true },
      error: null,
    }));
    const paper = await generatePaper({ ...config, counts: { MCQ: 3, MSQ: 0, NAT: 0 } });
    expect(paper.questions).toHaveLength(1);
    expect(paper.shortfallNote).toMatch(/asked for 3/);
    expect(paper.grounded).toBe(true);
  });

  it("throws a classified error — never fake questions — on moderation rejection", async () => {
    authed(async () => ({ data: null, error: httpError(403, { error: "moderation_blocked" }) }));
    const failure = await codeOf(generatePaper(config));
    expect(failure.code).toBe("moderation_blocked");
    expect(generationErrorInfo(failure).title).toMatch(/blocked/);
  });

  it("throws provider_error when the model is unreachable", async () => {
    authed(async () => ({ data: null, error: httpError(502, { error: "provider_error" }) }));
    expect((await codeOf(generatePaper(config))).code).toBe("provider_error");
  });

  it("throws no_valid_questions when the reply holds nothing usable", async () => {
    authed(async () => ({ data: { questions: [malformed] }, error: null }));
    expect((await codeOf(generatePaper(config))).code).toBe("no_valid_questions");
  });

  it("throws no_valid_questions on an empty question list", async () => {
    authed(async () => ({ data: { questions: [] }, error: null }));
    expect((await codeOf(generatePaper(config))).code).toBe("no_valid_questions");
  });

  it("throws network on a malformed non-question payload", async () => {
    authed(async () => ({ data: { statistics: "oops" }, error: null }));
    expect((await codeOf(generatePaper(config))).code).toBe("network");
  });

  it("throws sign_in with no client or no signed-in user", async () => {
    mockGetSupabaseBrowser.mockReturnValue(null);
    expect((await codeOf(generatePaper(config))).code).toBe("sign_in");
    mockGetSupabaseBrowser.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      functions: { invoke: async () => ({ data: null, error: null }) },
    });
    expect((await codeOf(generatePaper(config))).code).toBe("sign_in");
  });

  it("surfaces the server's invalid_config detail", async () => {
    authed(async () => ({
      data: null,
      error: httpError(400, { error: "invalid_config", detail: "Counts must give…" }),
    }));
    const failure = await codeOf(generatePaper(config));
    expect(failure.code).toBe("invalid_config");
    expect(generationErrorInfo(failure).description).toBe("Counts must give…");
  });
});
