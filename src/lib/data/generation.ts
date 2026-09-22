"use client";

/**
 * Generation-mode paper assembly (Supabase mode).
 *
 * The demo path builds papers from the sample bank; this one asks the
 * `practice-generator` Edge Function for AI-generated questions. The two paths
 * meet at the same place: an attempt is created and the student is taken to it.
 *
 * Two rules this module must not break:
 *
 *  1. **The server's output is untrusted input.** The Edge Function already
 *     validates the model's reply, but the response still travels over HTTP to
 *     a browser; every question is re-validated with the same rule book
 *     (`validateQuestion`) before it may enter a paper. A question that fails
 *     is dropped, never repaired.
 *  2. **No silent fallback.** If generation fails, the failure is thrown with a
 *     user-safe message. This module never substitutes sample questions — that
 *     would let a student believe a model produced them.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { validateQuestion, type Question } from "@/lib/quiz";
import { toAttemptQuestion, type AttemptQuestion, type QuestionProvenance } from "@/lib/attempts";
import { MAX_PRACTICE_QUESTIONS, type PracticeConfig } from "@/lib/practice";

/** A paper built by the practice-generator Edge Function. */
export interface GeneratedAiPaper {
  questions: AttemptQuestion[];
  provenance: QuestionProvenance;
  /** Honest shortfall sentence, or `null` when the request was fully met. */
  shortfallNote: string | null;
  /** True when the questions were grounded in an owned document's chunks. */
  grounded: boolean;
}

/** The success payload the Edge Function returns (re-validated, never trusted). */
interface GenerationResponse {
  questions: unknown;
  provenance?: unknown;
  grounded?: unknown;
  stats?: {
    requested?: number;
    delivered?: number;
    rejected?: number;
    duplicates?: number;
  };
}

/** A user-safe classification of every failure the generation path can hit. */
export interface GenerationErrorInfo {
  title: string;
  description: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function localError(code: string, detail: string | null): Error & { code: string; detail: string | null } {
  return Object.assign(new Error(code), { code, detail });
}

async function invokePracticeGenerator(
  supa: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  config: PracticeConfig,
): Promise<{ status: number; payload: unknown }> {
  // functions.invoke throws on non-2xx; the thrown error carries the HTTP
  // response in `context`, from which the function's error payload is read.
  const { data, error } = await supa.functions.invoke("practice-generator", {
    body: { config },
  });
  if (error) {
    const context = asRecord(error)?.context;
    const response = context instanceof Response ? context : null;
    let payload: unknown = null;
    if (response) {
      try {
        payload = await response.json();
      } catch {
        /* a non-JSON failure body still classifies by status below */
      }
    }
    throw { status: response?.status ?? 0, payload };
  }
  return { status: 200, payload: data };
}

function classifyFailure(status: number, payload: unknown): never {
  const record = asRecord(payload);
  const code = typeof record?.error === "string" ? record.error : null;
  const detail = typeof record?.detail === "string" ? record.detail : null;

  if (code === "invalid_config") throw localError("invalid_config", detail);
  if (code === "moderation_blocked") throw localError("moderation_blocked", null);
  if (code === "moderation_unavailable") throw localError("moderation_unavailable", null);
  if (code === "no_valid_questions") throw localError("no_valid_questions", detail);
  if (status === 502) throw localError("provider_error", null);
  throw localError("network", null);
}

/**
 * Ask the practice-generator Edge Function for a paper.
 *
 * Throws a classified error on any failure; on success returns the paper in
 * the same shape the demo path produces, so the practice screen treats both
 * uniformly and no fake questions are ever substituted on failure.
 */
export async function generatePaper(config: PracticeConfig): Promise<GeneratedAiPaper> {
  const supa = getSupabaseBrowser();
  if (!supa) throw localError("sign_in", null);
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) throw localError("sign_in", null);

  let status = 200;
  let payload: unknown;
  try {
    ({ status, payload } = await invokePracticeGenerator(supa, config));
  } catch (thrown) {
    const record = asRecord(thrown);
    if (record && "status" in record && "payload" in record) {
      classifyFailure(Number(record.status), record.payload);
    }
    throw localError("network", null);
  }

  const body = payload as GenerationResponse | null;
  if (!body || !Array.isArray(body.questions)) {
    classifyFailure(status, body);
  }

  const { questions, rejected } = validatedQuestions(body.questions);
  if (questions.length === 0) {
    throw localError("no_valid_questions", "The reply contained no usable questions.");
  }

  const requested =
    typeof body.stats?.requested === "number" && body.stats.requested > 0
      ? body.stats.requested
      : Object.values(config.counts).reduce((a, b) => a + b, 0);

  return {
    questions: questions.map((question, index) =>
      toAttemptQuestion(question, {
        index,
        subject: config.subject,
        topic: config.topic,
        difficulty: config.difficulty,
        provenance: "ai_generated",
      }),
    ),
    provenance: "ai_generated",
    shortfallNote: generationShortfallNote(requested, questions.length, rejected),
    grounded: body.grounded === true,
  };
}

/** Classify a thrown generation failure into user-safe copy. */
export function generationErrorInfo(error: unknown): GenerationErrorInfo {
  const info = asRecord(error);
  const code = typeof info?.code === "string" ? info.code : null;
  const detail = typeof info?.detail === "string" ? info.detail : null;

  switch (code) {
    case "sign_in":
      return { title: "Sign in required", description: "Sign in to generate a practice paper." };
    case "invalid_config":
      return {
        title: "That request was not valid",
        description: detail ?? "Check the practice settings and try again.",
      };
    case "moderation_blocked":
      return {
        title: "Request blocked",
        description:
          "This request was blocked by moderation. Adjust the branch, subject or topic and try again.",
      };
    case "moderation_unavailable":
      return {
        title: "Generation temporarily unavailable",
        description:
          "Moderation is not answering right now, so generation was stopped. Try again shortly.",
      };
    case "no_valid_questions":
      return {
        title: "No usable questions came back",
        description:
          detail ??
          "The model's reply contained no usable questions. Adjust the request or try again — nothing was stored.",
      };
    case "provider_error":
      return {
        title: "The model could not be reached",
        description: "The generation service could not reach its model. Try again in a moment.",
      };
    case "document_error":
      return {
        title: "The source document could not be read",
        description: "Generation stopped because the selected document could not be read. Try again.",
      };
    case "network":
      return {
        title: "Could not reach the generation service",
        description: "Check your connection and try again.",
      };
    default:
      return {
        title: "Generation failed",
        description: "Nothing was stored. Try again, or adjust the practice settings.",
      };
  }
}

/** Re-validate returned entries; drop unusable ones with a count. */
export function validatedQuestions(entries: unknown): { questions: Question[]; rejected: number } {
  const list = Array.isArray(entries) ? entries : [];
  const questions: Question[] = [];
  let rejected = 0;
  for (const entry of list.slice(0, MAX_PRACTICE_QUESTIONS)) {
    const verdict = validateQuestion(entry as Question);
    if (verdict.ok) questions.push(verdict.question);
    else rejected += 1;
  }
  return { questions, rejected };
}

/** The honest shortfall line for a delivered-vs-requested mismatch. */
export function generationShortfallNote(
  requested: number,
  delivered: number,
  rejected: number,
): string | null {
  if (requested <= 0 || delivered >= requested) return null;
  const parts = [
    `asked for ${requested}, ${delivered} usable question${delivered === 1 ? "" : "s"} came back`,
  ];
  if (rejected > 0) parts.push(`${rejected} rejected as malformed`);
  return `The paper is shorter than you asked for (${parts.join("; ")}).`;
}
