/**
 * Context selection for source-grounded question generation.
 *
 *   npx vitest run tests/context-selection.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  chunkAttribution,
  MAX_CONTEXT_CHARS,
  selectContext,
  type ContextChunk,
} from "../src/lib/context-selection";

function chunk(over: Partial<ContextChunk> = {}): ContextChunk {
  return {
    id: "c1",
    document_id: "d1",
    page_number: 3,
    content: "B-trees keep data sorted for fast lookups.",
    ...over,
  };
}

describe("selectContext", () => {
  it("ranks topic matches above subject-only matches, deterministically", () => {
    const subjectOnly = chunk({ id: "s1", content: "database systems overview" });
    const topicHit = chunk({ id: "t1", content: "indexing and B-tree indexing structure" });
    const first = selectContext([subjectOnly, topicHit], {
      subject: "Database Management",
      topic: "Indexing",
    });
    const second = selectContext([subjectOnly, topicHit], {
      subject: "Database Management",
      topic: "Indexing",
    });
    expect(first.map((c) => c.id)).toEqual(["t1", "s1"]);
    expect(first).toEqual(second);
  });

  it("drops malformed rows instead of sending junk to the model", () => {
    const picked = selectContext(
      [
        null as unknown as ContextChunk,
        chunk({ id: "", content: "x" }),
        chunk({ document_id: "" }),
        chunk({ content: "   " }),
        chunk({ page_number: Number.NaN }),
        chunk({ id: "ok" }),
      ],
      // A stop-word-only subject yields an empty keyword set: score 0 for all.
      { subject: "practice", topic: null },
    );
    expect(picked).toHaveLength(1);
    expect(picked[0].id).toBe("ok");
  });

  it("returns an empty selection for empty input", () => {
    expect(selectContext([], { subject: "X", topic: "Y" })).toEqual([]);
  });

  it("preserves provenance, including an absent page number", () => {
    const unpaginated = chunk({ id: "u1", page_number: null });
    const [picked] = selectContext([unpaginated], { subject: "", topic: null });
    expect(picked).toMatchObject({ id: "u1", document_id: "d1", page_number: null });
    expect(chunkAttribution(picked)).toBe("[chunk u1]");
  });

  it("respects the character budget without splitting a chunk", () => {
    const big = chunk({ id: "big", content: "a".repeat(600) });
    const small = chunk({ id: "small", content: "b".repeat(100) });
    const picked = selectContext([big, small], { subject: "", topic: null }, 500);
    expect(picked.map((c) => c.id)).toEqual(["small"]);
  });

  it("never exceeds MAX_CONTEXT_CHARS by default", () => {
    const chunks = Array.from({ length: 50 }, (_, i) =>
      chunk({ id: `c${i}`, content: "word ".repeat(100) }),
    );
    const picked = selectContext(chunks, { subject: "", topic: null });
    const total = picked.reduce((sum, c) => sum + c.content.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
  });

  it("shows page numbers in attribution when extraction recorded them", () => {
    expect(chunkAttribution(chunk({ id: "p1", page_number: 7 }))).toBe("[chunk p1, page 7]");
  });
});