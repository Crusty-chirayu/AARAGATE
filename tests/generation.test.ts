/**
 * Generation-mode attempt creation (`src/lib/data/generation.ts`).
 *
 * Deterministic and network-free: the Supabase client is mocked, so every Edge
 * Function reply — success, shortfall, moderation, provider failure, malformed
 * payload — is a fixture. No live AI is ever invoked here.
 *
 *   npx vitest run tests/generation.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generatePaper,
  generationErrorInfo,
  generationShortfallNote,
} from "../src/lib/data/generation";

const { mockGetSupabaseBrowser } = vi.hoisted(() => ({ mockGetSupabaseBrowser: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowser: mockGetSupabaseBrowser }));

const config = {
  branch: "Computer Science & Information Technology",
  subject: "Operating Systems",
  topic: null,
  difficulty: "medium" as const,
  counts: { MCQ: 2, MSQ: 1, NAT: 1 },
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
  } catch (error) {
    const record = error as { code?: string; detail?: string | null };
    return { code: record.code ?? "<none>", detail: record.detail ?? null };
  }
  return { code: "<resolved>", detail: null };
}

beforeEach(() => {
  mockGetSupabaseBrowser.mockReset();
});

describe("generatePaper", () => {
  it("sends only the validated config and returns the stored attempt id", async () => {
    const invoke = vi.fn(async () => ({
      data: {
        attemptId: "att-1",
        grounded: false,
        stats: { requested: 4, delivered: 4, rejected: 0 },
      },
      error: null,
    }));
    authed(invoke);

    const paper = await generatePaper(config);

    expect(invoke).toHaveBeenCalledWith("practice-generator", { body: { config } });
    expect(paper).toEqual({ attemptId: "att-1", shortfallNote: null, grounded: false });
  });

  it("ignores any question payload the reply happens to carry", async () => {
    authed(async () => ({
      data: {
        attemptId: "att-1",
        questions: [
          {
            kind: "MCQ",
            marks: 2,
            text: "q",
            options: [{ id: "A", text: "a" }],
            answer: ["A"],
            explanation: "because",
          },
        ],
        stats: { requested: 1, delivered: 1, rejected: 0 },
      },
      error: null,
    }));

    const paper = await generatePaper(config);
    const serialised = JSON.stringify(paper);

    expect(serialised).not.toContain("answer");
    expect(serialised).not.toContain("because");
  });

  it("reports an honest shortfall when fewer questions came back", async () => {
    authed(async () => ({
      data: { attemptId: "att-2", stats: { requested: 4, delivered: 2, rejected: 3 } },
      error: null,
    }));

    const paper = await generatePaper(config);

    expect(paper.shortfallNote).toContain("asked for 4");
    expect(paper.shortfallNote).toContain("2 usable questions");
    expect(paper.shortfallNote).toContain("3 rejected");
  });

  it("claims no shortfall when the reply carries no stats at all", async () => {
    authed(async () => ({ data: { attemptId: "att-3" }, error: null }));

    const paper = await generatePaper(config);

    expect(paper.attemptId).toBe("att-3");
    expect(paper.shortfallNote).toBeNull();
  });

  it("falls back to the config's total when the reply omits requested", async () => {
    authed(async () => ({ data: { attemptId: "att-3", stats: { delivered: 2 } }, error: null }));

    expect((await generatePaper(config)).shortfallNote).toContain("asked for 4");
  });

  it("keeps the grounded flag from the reply", async () => {
    authed(async () => ({ data: { attemptId: "att-4", grounded: true }, error: null }));

    expect((await generatePaper(config)).grounded).toBe(true);
  });

  it("requires an authenticated user", async () => {
    mockGetSupabaseBrowser.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      functions: { invoke: vi.fn() },
    });

    expect((await codeOf(generatePaper(config))).code).toBe("sign_in");
  });

  it("reports sign_in when Supabase is not configured", async () => {
    mockGetSupabaseBrowser.mockReturnValue(null);

    expect((await codeOf(generatePaper(config))).code).toBe("sign_in");
  });
});

describe("generatePaper failure classification", () => {
  it("passes through a rejected config with the server's detail", async () => {
    authed(async () => ({
      data: null,
      error: httpError(400, { error: "invalid_config", detail: "Branch is required." }),
    }));

    const { code, detail } = await codeOf(generatePaper(config));

    expect(code).toBe("invalid_config");
    expect(detail).toBe("Branch is required.");
  });

  it("distinguishes a blocked request from a moderation outage", async () => {
    authed(async () => ({
      data: null,
      error: httpError(422, { error: "moderation_blocked" }),
    }));
    expect((await codeOf(generatePaper(config))).code).toBe("moderation_blocked");

    authed(async () => ({
      data: null,
      error: httpError(503, { error: "moderation_unavailable" }),
    }));
    expect((await codeOf(generatePaper(config))).code).toBe("moderation_unavailable");
  });

  it("reports a model that produced nothing usable", async () => {
    authed(async () => ({
      data: null,
      error: httpError(422, { error: "no_valid_questions", detail: "No usable questions." }),
    }));

    const { code, detail } = await codeOf(generatePaper(config));

    expect(code).toBe("no_valid_questions");
    expect(detail).toBe("No usable questions.");
  });

  it("reports an unreachable provider", async () => {
    authed(async () => ({
      data: null,
      error: httpError(502, { error: "The provider returned an error (502)." }),
    }));

    expect((await codeOf(generatePaper(config))).code).toBe("provider_error");
  });

  it("reports a server-side failure distinctly from a provider failure", async () => {
    authed(async () => ({
      data: null,
      error: httpError(500, { error: "Could not store the paper. Nothing was saved." }),
    }));

    expect((await codeOf(generatePaper(config))).code).toBe("server_error");
  });

  it("classifies a non-JSON failure body by status", async () => {
    authed(async () => ({
      data: null,
      error: { context: new Response("<html>gateway</html>", { status: 502 }) },
    }));

    expect((await codeOf(generatePaper(config))).code).toBe("provider_error");
  });

  it("classifies a transport failure with no response at all", async () => {
    authed(async () => {
      throw new Error("fetch failed");
    });

    expect((await codeOf(generatePaper(config))).code).toBe("network");
  });

  it("refuses a success reply that carries no attempt id", async () => {
    authed(async () => ({ data: { stats: { requested: 4, delivered: 4 } }, error: null }));

    expect((await codeOf(generatePaper(config))).code).toBe("server_error");
  });

  it("refuses a blank attempt id", async () => {
    authed(async () => ({ data: { attemptId: "   " }, error: null }));

    expect((await codeOf(generatePaper(config))).code).toBe("server_error");
  });

  it("refuses a non-object body", async () => {
    authed(async () => ({ data: "ok", error: null }));

    expect((await codeOf(generatePaper(config))).code).toBe("server_error");
  });
});

describe("generationErrorInfo", () => {
  it("maps every classified code to non-empty copy", () => {
    const codes = [
      "sign_in",
      "invalid_config",
      "moderation_blocked",
      "moderation_unavailable",
      "no_valid_questions",
      "provider_error",
      "server_error",
      "network",
      "something_else",
    ];

    for (const code of codes) {
      const info = generationErrorInfo(Object.assign(new Error(code), { code }));
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
    }
  });

  it("surfaces the server's validation detail once", () => {
    const info = generationErrorInfo(
      Object.assign(new Error("invalid_config"), {
        code: "invalid_config",
        detail: "Counts must total at least one.",
      }),
    );

    expect(info.description).toBe("Counts must total at least one.");
  });

  it("falls back to generic copy for an unclassified error", () => {
    expect(generationErrorInfo(new Error("boom")).title).toBe("Generation failed");
    expect(generationErrorInfo(null).title).toBe("Generation failed");
  });
});

describe("generationShortfallNote", () => {
  it("is null when the request was met or beaten", () => {
    expect(generationShortfallNote(4, 4, 0)).toBeNull();
    expect(generationShortfallNote(4, 5, 0)).toBeNull();
  });

  it("is null when nothing was requested", () => {
    expect(generationShortfallNote(0, 0, 0)).toBeNull();
  });

  it("singularises a single delivered question", () => {
    expect(generationShortfallNote(3, 1, 0)).toContain("1 usable question ");
  });

  it("omits the rejected clause when nothing was rejected", () => {
    expect(generationShortfallNote(3, 2, 0)).not.toContain("rejected");
  });
});

