/**
 * Context selection for source-grounded question generation (priority: document
 * → understanding → generation).
 *
 * Pure and deterministic: given the chunk rows a document search or storage
 * query produced, rank and trim them to the budget a generation request may
 * send to a model. This module never invents content and never fabricates a
 * page number — a chunk without a page stays without one, and the caller's
 * provenance fields are passed through untouched.
 *
 * Determinism contract: the same input always yields the same selection and
 * order, so a generated paper is reproducible for the same document snapshot.
 */
import type { PracticeConfig } from "./practice";

/** One chunk of extracted document text, as stored by ingestion. */
export interface ContextChunk {
  id: string;
  document_id: string;
  /** Page number when extraction recorded one; `null` must stay `null`. */
  page_number: number | null;
  content: string;
}

/** A chunk chosen for the generation prompt, provenance preserved. */
export interface SelectedChunk {
  id: string;
  document_id: string;
  page_number: number | null;
  content: string;
}

/** How much extracted text one generation request may carry. */
export const MAX_CONTEXT_CHARS = 12_000;

/** Words so generic they say nothing about relevance. */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "about",
  "questions", "question", "paper", "practice", "gate", "exam", "subject",
  "topic", "computer", "science", "engineering", "systems", "introduction",
]);

/** Lowercased, stop-word-stripped keyword set of a free-text label. */
function keywords(label: string | null | undefined): Set<string> {
  if (!label) return new Set();
  return new Set(
    label
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/** Overlap score of a chunk against the keywords, in whole words matched. */
function relevance(content: string, words: Set<string>): number {
  if (words.size === 0) return 0;
  let hits = 0;
  for (const word of words) if (content.toLowerCase().includes(word)) hits += 1;
  return hits;
}

/**
 * Select and order the chunks for one generation request.
 *
 * Ranking is by keyword overlap with the topic first, then the subject — a
 * chunk about the requested topic outranks one that merely mentions the
 * subject. Ties keep the caller's order, so equal-scoring chunks do not
 * reshuffle between runs. The budget is enforced by character count, never by
 * guessing which sentences matter: chunks are taken whole.
 *
 * Malformed rows (no id, no document id, empty content) are dropped rather
 * than sent to the model as junk, and an empty result is a valid outcome —
 * callers must treat it as "no usable source" and fail honestly.
 */
export function selectContext(
  chunks: readonly ContextChunk[],
  intent: Pick<PracticeConfig, "subject" | "topic">,
  maxChars: number = MAX_CONTEXT_CHARS,
): SelectedChunk[] {
  const topicWords = keywords(intent.topic);
  const subjectWords = keywords(intent.subject);

  const scored: Array<{ chunk: ContextChunk; score: number }> = [];
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== "object") continue;
    if (typeof chunk.id !== "string" || !chunk.id) continue;
    if (typeof chunk.document_id !== "string" || !chunk.document_id) continue;
    if (typeof chunk.content !== "string" || chunk.content.trim() === "") continue;
    if (chunk.page_number !== null && !Number.isFinite(chunk.page_number)) continue;
    scored.push({
      chunk,
      score: relevance(chunk.content, topicWords) * 2 + relevance(chunk.content, subjectWords),
    });
  }

  // Stable sort: Array.prototype.sort is stable in modern engines, so ties
  // preserve the caller's original order and the output is deterministic.
  scored.sort((a, b) => b.score - a.score);

  const selected: SelectedChunk[] = [];
  let used = 0;
  for (const { chunk } of scored) {
    if (used + chunk.content.length > maxChars) continue;
    selected.push({
      id: chunk.id,
      document_id: chunk.document_id,
      page_number: chunk.page_number,
      content: chunk.content,
    });
    used += chunk.content.length;
    if (used >= maxChars) break;
  }
  return selected;
}

/**
 * The `[page N]` attribution block a prompt places under each chunk.
 *
 * Only pages extraction actually recorded are shown; a chunk without a page
 * number is attributed by id alone rather than given an invented one.
 */
export function chunkAttribution(chunk: SelectedChunk): string {
  return chunk.page_number === null
    ? `[chunk ${chunk.id}]`
    : `[chunk ${chunk.id}, page ${chunk.page_number}]`;
}