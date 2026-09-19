/**
 * Regenerate target authorization (security review — HIGH, resolved here).
 *
 * The regression this guards: the orchestrator flipped a caller-supplied
 * `supersedes_id` to `superseded` with no conversation scope at all, using the
 * service_role client that bypasses RLS. Any authenticated user could therefore
 * pass a message UUID from another room and remove it from that room's
 * transcript.
 *
 * The fix has two halves and this file covers one of them: the row must be
 * loaded SCOPED to the caller's conversation (a query property, asserted by
 * inspection — a lookup scoped to the conversation can only ever return a row
 * from it), and the remaining rules live in `supersedeVerdict`, which is what
 * is exercised exhaustively below.
 *
 *   npx vitest run tests/supersede-authorization.test.ts
 */
import { describe, expect, it } from "vitest";

import {
  supersedeVerdict,
  type SupersedeCandidate,
} from "../supabase/functions/_shared/supersede";

const CONVERSATION = "11111111-1111-4111-8111-111111111111";
const OTHER_CONVERSATION = "22222222-2222-4222-8222-222222222222";

function candidate(over: Partial<SupersedeCandidate> = {}): SupersedeCandidate {
  return {
    conversation_id: CONVERSATION,
    sender_type: "ai",
    status: "sent",
    deleted_at: null,
    ...over,
  };
}

describe("supersede target authorization", () => {
  it("allows regenerating a live assistant message in the caller's conversation", () => {
    expect(supersedeVerdict(candidate(), CONVERSATION)).toEqual({ ok: true });
  });

  it("refuses a target belonging to another conversation", () => {
    expect(supersedeVerdict(candidate({ conversation_id: OTHER_CONVERSATION }), CONVERSATION)).toEqual({
      ok: false,
      code: "supersede_target_not_found",
    });
  });

  it("refuses a scoped lookup that matched nothing", () => {
    // "No such message" and "not in this conversation" are deliberately
    // indistinguishable, so the response leaks nothing about other rooms.
    expect(supersedeVerdict(null, CONVERSATION)).toEqual({
      ok: false,
      code: "supersede_target_not_found",
    });
  });

  it("refuses to supersede a human message", () => {
    expect(supersedeVerdict(candidate({ sender_type: "human" }), CONVERSATION)).toEqual({
      ok: false,
      code: "supersede_target_not_assistant",
    });
  });

  it("refuses a soft-deleted message", () => {
    const deleted = candidate({ deleted_at: "2026-09-19T00:00:00.000Z" });
    expect(supersedeVerdict(deleted, CONVERSATION)).toEqual({
      ok: false,
      code: "supersede_target_deleted",
    });
  });

  it("refuses an already-superseded message", () => {
    expect(supersedeVerdict(candidate({ status: "superseded" }), CONVERSATION)).toEqual({
      ok: false,
      code: "supersede_target_already_superseded",
    });
  });

  it("never permits a target outside the conversation, whatever its other fields say", () => {
    // The exact shape of the closed vulnerability: an otherwise perfectly
    // valid assistant message that simply belongs to somebody else's room.
    for (const status of ["sent", "streaming", "blocked", "error", "superseded"]) {
      for (const sender_type of ["ai", "human"]) {
        for (const deleted_at of [null, "2026-09-19T00:00:00.000Z"]) {
          const verdict = supersedeVerdict(
            candidate({ conversation_id: OTHER_CONVERSATION, status, sender_type, deleted_at }),
            CONVERSATION,
          );
          expect(verdict.ok).toBe(false);
        }
      }
    }
  });

  it("reports a stable code for every rejection, so no refusal is a silent no-op", () => {
    const rejections = [
      supersedeVerdict(null, CONVERSATION),
      supersedeVerdict(candidate({ conversation_id: OTHER_CONVERSATION }), CONVERSATION),
      supersedeVerdict(candidate({ sender_type: "human" }), CONVERSATION),
      supersedeVerdict(candidate({ deleted_at: "2026-09-19T00:00:00.000Z" }), CONVERSATION),
      supersedeVerdict(candidate({ status: "superseded" }), CONVERSATION),
    ];
    for (const verdict of rejections) {
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.code).toMatch(/^supersede_/);
    }
  });
});