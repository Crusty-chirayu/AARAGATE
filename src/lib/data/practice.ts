/**
 * Paper assembly for DEMO MODE.
 *
 * In demo mode there is no provider to call and no generated question bank to
 * draw from, so practice papers are built from `src/lib/sample-questions`. The
 * one thing this module must get right is **honesty about the shortfall**: if a
 * student asks for four MCQs on a subject where the bank holds two, the paper
 * comes back with two questions, a `shortfall` entry that says so, and a screen
 * that states it — never a silently shorter paper, and never a padded one.
 *
 * Unlike `src/lib/practice.ts`, which is the pure generation *contract* for the
 * Supabase path, this module is demo-only plumbing.
 */
import {
  AI_GENERATED_LABEL,
  type PracticeConfig,
} from "@/lib/practice";
import { toAttemptQuestion, type AttemptQuestion, type QuestionProvenance } from "@/lib/attempts";
import { sampleQuestionsFor } from "@/lib/sample-questions";
import type { QuestionKind } from "@/lib/quiz";

/** How far short a paper fell for one question kind. */
export interface PaperShortfall {
  requested: number;
  available: number;
}

export interface GeneratedPaper {
  /** The paper, in question order, each question carrying its own provenance. */
  questions: AttemptQuestion[];
  /** Where these questions came from. Demo papers are always `sample`. */
  provenance: QuestionProvenance;
  /** Kinds the bank could not fully satisfy. Empty when the request was met. */
  shortfall: Partial<Record<QuestionKind, PaperShortfall>>;
}

const KINDS: readonly QuestionKind[] = ["MCQ", "MSQ", "NAT"];

/**
 * Build a paper from the sample bank for the given configuration.
 *
 * Each kind is drawn independently and in `MCQ, MSQ, NAT` order, so the same
 * configuration always produces the same paper. Questions are ordered by kind
 * rather than shuffled: a reproducible demo is worth more than a random one,
 * and nothing here claims to imitate the real paper's ordering.
 */
export function samplePaper(config: PracticeConfig): GeneratedPaper {
  const pool = sampleQuestionsFor({
    branch: config.branch,
    subject: config.subject,
    topic: config.topic,
    difficulty: config.difficulty,
  });

  const shortfall: Partial<Record<QuestionKind, PaperShortfall>> = {};
  const questions: AttemptQuestion[] = [];

  for (const kind of KINDS) {
    const requested = config.counts[kind] ?? 0;
    if (requested <= 0) continue;

    const available = pool.filter((entry) => entry.question.kind === kind);
    const taken = available.slice(0, Math.min(requested, available.length));
    if (taken.length < requested) {
      shortfall[kind] = { requested, available: taken.length };
    }

    for (const entry of taken) {
      questions.push(
        toAttemptQuestion(entry.question, {
          index: questions.length,
          subject: entry.subject,
          topic: entry.topic,
          difficulty: entry.difficulty,
          provenance: "sample",
        }),
      );
    }
  }

  return { questions, provenance: "sample", shortfall };
}

/**
 * The provenance line a paper must display.
 *
 * A sample paper is never allowed to read as an official one, and an AI paper
 * carries the same label `practice.ts` puts on generated questions.
 */
export function paperProvenanceLabel(paper: GeneratedPaper): string {
  return paper.provenance === "sample"
    ? "Built-in sample questions — written for practice, not taken from an official GATE paper."
    : AI_GENERATED_LABEL;
}

/** Human sentence for a shortfall, or `null` when the request was fully met. */
export function shortfallNote(shortfall: Partial<Record<QuestionKind, PaperShortfall>>): string | null {
  const parts = KINDS.filter((kind) => shortfall[kind]).map((kind) => {
    const entry = shortfall[kind] as PaperShortfall;
    return `${kind}: asked for ${entry.requested}, the bank holds ${entry.available}`;
  });
  if (parts.length === 0) return null;
  return `The sample bank could not fill the whole request (${parts.join("; ")}).`;
}

/**
 * How many sample questions exist for a subject (and optional topic).
 *
 * Used by the practice screen to warn before a request is sent, rather than
 * letting a student discover the shortfall only after the paper is built.
 */
export function sampleAvailability(subject: string, topic: string | null): number {
  return sampleQuestionsFor({ subject, topic }).length;
}
