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
 *    owner-scoped by RLS, reads go only through the `get_quiz_attempt` RPC
 *    (which strips `answer`/`nat_range`/`explanation` before submission), and
 *    scoring happens in the `submit_quiz_attempt` RPC. Creation is NOT here —
 *    the `practice-generator` Edge Function stores the paper (key included) and
 *    returns only an attempt id, so the browser never holds the keyed snapshot.
 *    `quiz_attempt_items` has deliberately NO select policy: even the owner
 *    cannot SELECT the full question snapshot directly, so the RPC's
 *    key-stripping cannot be bypassed by a call site that queries the table
 *    instead.
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
 * Persist a freshly built attempt — **demo mode only**.
 *
 * Supabase-mode papers are generated *and stored* server-side by the
 * `practice-generator` Edge Function, which returns an attempt id; the browser
 * never holds the keyed snapshot. This function therefore refuses to write in
 * Supabase mode rather than inserting questions whose `answer` / `nat_range` /
 * `explanation` a client could read in devtools before submitting.
 */
export async function createAttempt(attempt: QuizAttempt): Promise<void> {
  if (!DEMO_MODE) {
    throw new Error(
      "Attempts are created server-side; the browser must not store a paper's answer key.",
    );
  }

  writeDemo([attempt, ...readDemo().filter((row) => row.id !== attempt.id)]);
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

