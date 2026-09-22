"use client";

/**
 * Generation-mode attempt creation (Supabase mode).
 *
 * The demo path builds papers from the sample bank and grades them in the
 * browser. This path does something structurally different: the
 * `practice-generator` Edge Function generates the questions **and stores the
 * paper**, and what comes back here is an attempt id — never the questions.
 *
 * That is the whole point. A question snapshot contains the answer key, and the
 * key must not exist in the browser before submission:
 *
 *  - `quiz_attempt_items` has no SELECT policy, so the stored snapshot is not
 *    readable by any client — not even its owner's own rows.
 *  - `get_quiz_attempt` (SECURITY DEFINER) strips `answer` / `nat_range` /
 *    `explanation` until the paper is submitted.
 *  - `submit_quiz_attempt` scores against the stored snapshot server-side.
 *
 * So the browser is handed a paper id and the screen loads the public form
 * through the RPC. This module therefore has no question types and nothing to
 * leak: a payload that happens to include questions is ignored outright.
 *
 * Failures are explicit. Nothing here substitutes sample questions for
 * generated ones — that would let a student believe a model produced them.
 */
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { PracticeConfig } from "@/lib/practice";

/** The result of a successful generation request: where the paper now lives. */
export interface GeneratedAiAttempt {
  attemptId: string;
  /** Honest shortfall sentence, or `null` when the request was fully met. */
  shortfallNote: string | null;
  /** True when the questions were grounded in an owned document's chunks. */
  grounded: boolean;
}

/** The success payload the Edge Function returns. Anything else is ignored. */
interface GenerationResponse {
  attemptId?: unknown;
  grounded?: unknown;
  stats?: unknown;
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

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function localError(
  code: string,
  detail: string | null,
): Error & { code: string; detail: string | null } {
  return Object.assign(new Error(code), { code, detail });
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
    case "server_error":
      return {
        title: "The paper could not be created",
        description: "Generation failed on the server. Nothing was stored — try again.",
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

/** Map an HTTP failure from the Edge Function onto a classified error. */
function classifyFailure(status: number, payload: unknown): never {
  const record = asRecord(payload);
  const code = typeof record?.error === "string" ? record.error : null;
  const detail = typeof record?.detail === "string" ? record.detail : null;

  if (code === "invalid_config") throw localError("invalid_config", detail);
  if (code === "moderation_blocked") throw localError("moderation_blocked", null);
  if (code === "moderation_unavailable") throw localError("moderation_unavailable", null);
  if (code === "no_valid_questions") throw localError("no_valid_questions", detail);
  if (status === 502) throw localError("provider_error", null);
  if (status >= 500) throw localError("server_error", null);
  throw localError("network", null);
}

/**
 * Ask the practice-generator Edge Function for a paper.
 *
 * Only the validated config is sent — never a user id, never a document's
 * contents. Returns the id of the attempt the server stored; throws a
 * classified error on any failure.
 */
export async function generatePaper(config: PracticeConfig): Promise<GeneratedAiAttempt> {
  const supa = getSupabaseBrowser();
  if (!supa) throw localError("sign_in", null);
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) throw localError("sign_in", null);

  // A non-2xx reply resolves with `error` (the function's own payload hanging
  // off `error.context`); a transport failure rejects instead, so both shapes
  // are handled — a rejection must not escape as an unclassified error.
  let invoked: { data: unknown; error: unknown };
  try {
    invoked = await supa.functions.invoke("practice-generator", { body: { config } });
  } catch {
    throw localError("network", null);
  }

  if (invoked.error) {
    const context = asRecord(invoked.error)?.context;
    const response = context instanceof Response ? context : null;
    let payload: unknown = null;
    if (response) {
      try {
        payload = await response.json();
      } catch {
        /* a non-JSON failure body still classifies by status below */
      }
    }
    classifyFailure(response?.status ?? 0, payload);
  }

  const body = asRecord(invoked.data) as GenerationResponse | null;
  const attemptId =
    typeof body?.attemptId === "string" && body.attemptId.trim() !== "" ? body.attemptId : null;
  if (!attemptId) throw localError("server_error", null);

  const stats = asRecord(body?.stats);
  const requested = numberOr(
    stats?.requested,
    Object.values(config.counts).reduce((a, b) => a + b, 0),
  );
  const delivered = numberOr(stats?.delivered, requested);
  const rejected = numberOr(stats?.rejected, 0);

  return {
    attemptId,
    shortfallNote: generationShortfallNote(requested, delivered, rejected),
    grounded: body?.grounded === true,
  };
}
