"use client";

/**
 * Practice-attempt storage.
 *
 * Two backing stores, one contract:
 *
 *  - **Demo mode** (no Supabase configured): attempts live in `localStorage`,
 *    keyed separately from the chat store. They are real records — they survive
 *    a reload, they are scoped to this browser, and the review screen re-reads
 *    them — but they are NOT server-authoritative, and the answer key is
 *    unavoidably present in the client because there is no server to hold it.
 *  - **Supabase mode**: rows live in `quiz_attempts` / `quiz_attempt_items`,
 *    owner-scoped by RLS, and scoring happens in the `submit_quiz_attempt` RPC.
 *    The key is not readable by the client before submission, which is the only
 *    way a paper's key is actually safe.
 *
 * The Supabase path is code-complete against
 * `supabase/migrations/20260920000000_quiz_attempts.sql`, which is **not
 * applied** and has not been run against a live project — there is no linked
 * project or local stack in this environment. It is reported as unverified in
 * docs rather than claimed as working.
 */
import { DEMO_MODE } from "@/lib/env";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { uuid } from "./demo-store";
import {
  gradeAttempt,
  responsesByIndex,
  type AttemptMeta,
  type QuizAttempt,
} from "@/lib/attempts";
import type { QuizResult, Response } from "@/lib/quiz";

/** Demo-mode store key. Separate from the chat store, which has its own schema. */
const ATTEMPTS_KEY = "aichat.attempts.v1";

/** How many attempts the list returns. Bounded so a long history stays cheap. */
export const ATTEMPT_PAGE_SIZE = 50;

/**
 * A row in the attempt history.
 *
 * Deliberately not a `QuizAttempt`: the list needs metadata and the stored
 * score, and `question_count` is what it shows instead of the questions. A
 * summary cannot be mistaken for a paper whose questions failed to load.
 */
export interface AttemptSummary extends AttemptMeta {
  /** Present only once the paper was submitted. */
  result?: QuizResult | null;
  question_count: number;
}

/** A fresh attempt id. Falls back only where `randomUUID` is unavailable. */
export function newAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return uuid();
}

function readDemo(): QuizAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QuizAttempt[]) : [];
  } catch {
    // A corrupt store must not break the practice screen; an empty history is
    // the honest reading of "this browser holds no readable attempts".
    return [];
  }
}

function writeDemo(attempts: QuizAttempt[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch {
    /* quota — the attempt is still handed back to the caller for this session */
  }
}

/* -------------------------------------------------------------------------- */
/* History                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The attempt history, most recent first.
 *
 * In demo mode this is read from `localStorage` and is therefore *this
 * browser's* history. In Supabase mode it is the caller's own rows, ordered by
 * creation date — RLS, not this function, is what keeps them private.
 */
export async function listAttempts(): Promise<AttemptSummary[]> {
  if (DEMO_MODE) {
    return readDemo()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, ATTEMPT_PAGE_SIZE)
      .map((attempt) => ({
        id: attempt.id,
        branch: attempt.branch,
        subject: attempt.subject,
        topic: attempt.topic,
        difficulty: attempt.difficulty,
        sourceDocumentId: attempt.sourceDocumentId,
        created_at: attempt.created_at,
        submitted_at: attempt.submitted_at ?? null,
        result: attempt.result ?? null,
        question_count: attempt.questions.length,
      }));
  }

  const supa = getSupabaseBrowser();
  if (!supa) throw new Error("Sign in to see your practice history.");
  const { data, error } = await supa
    .from("quiz_attempts")
    .select(
      "id, branch, subject, topic, difficulty, source_document_id, created_at, submitted_at, result, question_count",
    )
    .order("created_at", { ascending: false })
    .limit(ATTEMPT_PAGE_SIZE);
  if (error) throw new Error("Could not load your practice history.");

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id),
      branch: String(record.branch ?? ""),
      subject: String(record.subject ?? ""),
      topic: (record.topic as string | null) ?? null,
      difficulty: record.difficulty as AttemptSummary["difficulty"],
      sourceDocumentId: (record.source_document_id as string | null) ?? null,
      created_at: String(record.created_at ?? ""),
      submitted_at: (record.submitted_at as string | null) ?? null,
      result: (record.result as QuizResult | null) ?? null,
      question_count: Number(record.question_count ?? 0),
    };
  });
}

/**
 * Read one attempt.
 *
 * The attempt must belong to the caller; demo mode enforces that by only ever
 * looking in this browser's store, and Supabase mode by RLS plus the RPC's own
 * ownership check. Returns `null` when the attempt is not found — a missing
 * paper is a normal outcome, not an error.
 */
export async function getAttempt(id: string): Promise<QuizAttempt | null> {
  if (DEMO_MODE) {
    return readDemo().find((attempt) => attempt.id === id) ?? null;
  }

  const supa = getSupabaseBrowser();
  if (!supa) throw new Error("Sign in to open an attempt.");
  const { data, error } = await supa.rpc("get_quiz_attempt", { p_attempt_id: id });
  if (error) throw new Error("Could not load the attempt.");
  if (!data) return null;
  return data as QuizAttempt;
}

/** Remove one attempt. Used by "discard" on a finished paper. */
export async function deleteAttempt(id: string): Promise<void> {
  if (DEMO_MODE) {
    writeDemo(readDemo().filter((attempt) => attempt.id !== id));
    return;
  }

  const supa = getSupabaseBrowser();
  if (!supa) throw new Error("Sign in to manage your attempts.");
  // Items cascade from the attempt, so one delete is enough.
  const { error } = await supa.from("quiz_attempts").delete().eq("id", id);
  if (error) throw new Error("Could not delete the attempt.");
}

/* -------------------------------------------------------------------------- */
/* Write                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Persist a freshly built attempt.
 *
 * Write order matters in Supabase mode: the attempt row goes in first, then the
 * question snapshot. If the items insert fails, the attempt row is removed
 * again rather than left behind as an empty paper — an attempt with no
 * questions would show a student a "0 / 0 · 100%" result for a paper that was
 * never sat.
 */
export async function createAttempt(attempt: QuizAttempt): Promise<void> {
  if (DEMO_MODE) {
    writeDemo([attempt, ...readDemo().filter((row) => row.id !== attempt.id)]);
    return;
  }

  const supa = getSupabaseBrowser();
  if (!supa) throw new Error("Sign in to start a practice attempt.");
  const { data: auth } = await supa.auth.getUser();
  if (!auth.user) throw new Error("Sign in to start a practice attempt.");

  const { error: attemptError } = await supa.from("quiz_attempts").insert({
    id: attempt.id,
    user_id: auth.user.id,
    branch: attempt.branch,
    subject: attempt.subject,
    topic: attempt.topic,
    difficulty: attempt.difficulty,
    source_document_id: attempt.sourceDocumentId,
    created_at: attempt.created_at,
    question_count: attempt.questions.length,
  });
  if (attemptError) throw new Error("Could not start the attempt.");

  const { error: itemsError } = await supa.from("quiz_attempt_items").insert(
    attempt.questions.map((question) => ({
      attempt_id: attempt.id,
      user_id: auth.user.id,
      position: question.index,
      kind: question.kind,
      marks: question.marks,
      subject: question.subject,
      topic: question.topic,
      difficulty: question.difficulty,
      provenance: question.provenance,
      question,
    })),
  );
  if (itemsError) {
    await supa.from("quiz_attempts").delete().eq("id", attempt.id);
    throw new Error("Could not store the questions. The attempt was rolled back.");
  }
}

/**
 * Submit responses and store the score.
 *
 * Demo mode scores locally with the shared engine (`gradeAttempt`), so the
 * screens and the unit tests exercise exactly the arithmetic the server would
 * run. Supabase mode sends only the responses: the RPC scores against the
 * stored question snapshot and returns the revealed review, so the key never
 * reaches the client before submission and a resubmission cannot rewrite a
 * stored score.
 */
export async function submitAttempt(
  attempt: QuizAttempt,
  answers: Readonly<Record<number, Response | undefined>>,
  submittedAt: string,
): Promise<QuizAttempt> {
  if (DEMO_MODE) {
    const { attempt: graded } = gradeAttempt(attempt, answers, submittedAt);
    writeDemo([graded, ...readDemo().filter((row) => row.id !== graded.id)]);
    return graded;
  }

  const supa = getSupabaseBrowser();
  if (!supa) throw new Error("Sign in to submit an attempt.");
  const { data, error } = await supa.rpc("submit_quiz_attempt", {
    p_attempt_id: attempt.id,
    // The RPC requires a JSON object keyed by question index, not the dense
    // array `orderResponses` produces — a keyed object is what it validates.
    p_responses: responsesByIndex(answers, attempt.questions.length),
  });
  if (error) throw new Error("Could not submit the attempt. Nothing was scored.");
  if (!data) throw new Error("The attempt could not be found on the server.");
  return data as QuizAttempt;
}

