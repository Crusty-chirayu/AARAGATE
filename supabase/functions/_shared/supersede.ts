// =====================================================================
// supersede authorization — pure, dependency-free.
//
// "Regenerate" replaces an earlier assistant answer, so the orchestrator has
// to mark a caller-supplied message id as `superseded`. It does that with the
// service_role client, which BYPASSES RLS, so the decision cannot be delegated
// to a policy: it is made explicitly here and unit-tested.
//
// The rule that actually closes the hole is the caller's QUERY — the row must
// be loaded scoped to the conversation the caller was already verified to be a
// member of, never by id alone. This function then enforces the remaining
// rules. Every failure is an explicit rejection with a stable code; none of
// them is a silent no-op, because a silent no-op is indistinguishable from
// success and hides the attempt.
// =====================================================================

/** The `messages` columns this decision needs to see. */
export interface SupersedeCandidate {
  conversation_id: string;
  sender_type: string;
  status: string;
  deleted_at: string | null;
}

export type SupersedeVerdict = { ok: true } | { ok: false; code: string };

/**
 * May this message be replaced by a regenerate in `conversationId`?
 *
 * `candidate` is `null` when the scoped lookup found nothing, which covers both
 * "no such message" and "that message is not in this conversation" — the two
 * are deliberately indistinguishable to the caller.
 */
export function supersedeVerdict(
  candidate: SupersedeCandidate | null,
  conversationId: string,
): SupersedeVerdict {
  if (!candidate) return { ok: false, code: "supersede_target_not_found" };
  if (candidate.conversation_id !== conversationId) {
    return { ok: false, code: "supersede_target_not_found" };
  }
  if (candidate.sender_type !== "ai") {
    return { ok: false, code: "supersede_target_not_assistant" };
  }
  if (candidate.deleted_at !== null) {
    return { ok: false, code: "supersede_target_deleted" };
  }
  if (candidate.status === "superseded") {
    return { ok: false, code: "supersede_target_already_superseded" };
  }
  return { ok: true };
}