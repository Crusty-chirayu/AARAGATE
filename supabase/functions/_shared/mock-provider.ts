/**
 * Deterministic mock provider — TESTS ONLY.
 *
 * Isolation guarantees (all three hold by construction):
 *   1. No production file imports this module — `tests/ai-provider-readiness.test.ts`
 *      asserts that `practice-generator` and `ai-orchestrator` never reference it.
 *   2. It performs no network I/O and reads no environment secrets.
 *   3. `mockProviderFetch` refuses to run outside a test process, so it cannot
 *      be wired into a running Edge Function by accident.
 *
 * The mock speaks the same SSE shape the real providers stream (`data:` lines
 * terminated by a blank line, a final `data: [DONE]` sentinel, and an optional
 * `event: error` terminal), so the production SSE parser can be exercised
 * end-to-end without credentials or paid calls.
 */

/** A finished SSE frame sequence, ready to feed the production parser. */
export interface MockSsePayload {
  /** Full SSE body: `data: {...}\n\n` frames plus the `data: [DONE]` sentinel. */
  body: string;
  /** The JSON assistant content the frames carry (double-encoded as providers do). */
  content: string;
}

/** The minimal practice-config shape the mock needs. Deliberately structural. */
export interface MockPracticeConfig {
  counts: Record<string, number>;
  subject: string;
  topic: string | null;
  difficulty: string;
}

const KIND_CYCLE = ["MCQ", "MSQ", "NAT"] as const;

/**
 * One question in the exact wire shape `validateQuestion` accepts (the shape
 * `buildPracticePrompt` contracts for): `kind` — not `type` — object options
 * with short ids, `answer` as an array of those ids, and for NAT a numeric
 * range with no options at all. Unknown fields would be stripped rather than
 * preserved, so the mock emits exactly the contract and nothing beyond it:
 * provenance lives at attempt level via `practiceProvenance`, not per question.
 */
function questionFor(index: number, config: MockPracticeConfig): unknown {
  const kind = KIND_CYCLE[index % KIND_CYCLE.length];
  const text = `Mock ${kind} question ${index + 1} for ${config.subject}${
    config.topic ? ` / ${config.topic}` : ""
  }?`;
  const explanation = `Deterministic mock explanation for question ${index + 1}.`;

  if (kind === "NAT") {
    // NAT: numeric acceptance range, no options, no answer ids.
    return { kind, marks: 2, text, nat_range: { min: 0, max: 10 }, explanation };
  }
  const options = ["A", "B", "C", "D"].map((id) => ({
    id,
    text: `Option ${id} for mock question ${index + 1}`,
  }));
  // MSQ carries several correct ids; MCQ exactly one — the validator enforces
  // that cardinality, so the mock must produce it rather than dodge it.
  const answer = kind === "MSQ" ? ["A", "C"] : ["A"];
  return { kind, marks: 2, text, options, answer, explanation };
}

/** Deterministically count questions actually requested by the config. */
export function mockRequestedCount(config: MockPracticeConfig): number {
  return Object.values(config.counts).reduce(
    (total, value) => total + (typeof value === "number" && value > 0 ? value : 0),
    0,
  );
}

/** Build the JSON array of mock questions the model would have returned. */
export function mockQuestionJson(config: MockPracticeConfig): string {
  const requested = mockRequestedCount(config);
  const questions = Array.from({ length: requested }, (_, index) => questionFor(index, config));
  return JSON.stringify(questions);
}

/**
 * One OpenAI-compatible content-delta frame: the real wire shape is
 * `data: {"choices":[{"delta":{"content":…}}]}`, and `parseSSEFrame` drops
 * anything that is not a record — a bare JSON string never reaches the parser.
 */
function deltaFrame(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

/** The usage-accounting frame real providers send just before `[DONE]`. */
const USAGE_FRAME = `data: ${JSON.stringify({
  choices: [{ delta: {} }],
  usage: { prompt_tokens: 12, completion_tokens: 34 },
})}\n\n`;

/** Split the payload across two frames so the decoder's reassembly is exercised. */
function twoFrames(content: string): string {
  const mid = Math.ceil(content.length / 2);
  return deltaFrame(content.slice(0, mid)) + deltaFrame(content.slice(mid));
}

/**
 * A successful stream: two content deltas (forcing reassembly), a usage
 * frame, then the `[DONE]` sentinel every OpenAI-compatible stream ends with.
 */
export function mockProviderStream(config: MockPracticeConfig): MockSsePayload {
  const content = mockQuestionJson(config);
  return { body: `${twoFrames(content)}${USAGE_FRAME}data: [DONE]\n\n`, content };
}

/**
 * A stream that terminates in a provider-side error. The shape is the real
 * one — a top-level `{"error":{…}}` record (`event:` lines are ignored by the
 * parser). Used to prove terminal errors are surfaced without leaking
 * internals: only the payload's own message crosses into the app event.
 */
export function mockProviderErrorStream(code = "mock_provider_overloaded"): MockSsePayload {
  const payload = JSON.stringify({ error: { code, message: "mock provider terminal error" } });
  return { body: `data: ${payload}\n\n`, content: payload };
}

/**
 * Well-formed frames whose *content* is truncated JSON — the provider died
 * mid-generation. Frames pass the decoder; the concatenated reply must then
 * fail `parsePracticeQuestions` rather than parse into a partial paper.
 */
export function mockProviderMalformedStream(): MockSsePayload {
  const truncated = '{"questions":[{"kind":"MCQ","marks":2,"text":"Cut off mid-generation';
  return { body: `${twoFrames(truncated)}${USAGE_FRAME}data: [DONE]\n\n`, content: truncated };
}

/**
 * Drop-in `fetch` replacement for tests. Returns a streaming `Response` whose
 * body is the supplied SSE text. Throws outside a test process so it can never
 * become part of a deployed handler.
 */
export async function mockProviderFetch(sseBody: string): Promise<Response> {
  const inTest =
    typeof process !== "undefined" &&
    (process.env.VITEST === "true" || process.env.NODE_ENV === "test");
  if (!inTest) {
    throw new Error("mockProviderFetch is tests-only and must not run outside a test process");
  }
  return new Response(sseBody, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}
