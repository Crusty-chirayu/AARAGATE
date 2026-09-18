# Supabase security review — local checkpoint

Static review only; no migrations modified/applied. All six SQL files, private ingestion,
auth clients/middleware/callback and selected legacy Edge paths reviewed. This is not an
exhaustive repository certification. No live vulnerability reproduction performed.

## Local migration order (not a remote plan)

Under `D:\AARAGATE\supabase\migrations`:

1. `20260101000000_init.sql`: six enums; profiles, conversations, conversation_members,
   messages, message_attachments, reactions, invites, moderation_events, rate_limit_events,
   ai_usage_log; RLS, auth/profile triggers, membership helpers, create/search/read RPCs,
   indexes, realtime publication, avatars/public and attachments/private storage, views.
2. `20260828000000_rls_hardening.sql`: membership/message/profile/reaction policy fixes,
   message/invite rate triggers/indexes. Preserve order. Some policy creates are not
   replay-idempotent despite the header comment.
3. `20260828000001_pinned_conversations.sql`: nullable per-member pinned_at.
4. `20260901000000_v3_attachment_understanding.sql`: vector, status columns/check/backfill,
   attachment_chunks, member SELECT/denied client writes, FK/unique/FTS/vector indexes,
   retrieval/status/context RPCs, privileged completion/failure RPCs with client revokes.
5. `20260901000001_v3_verified_citations.sql`: messages.citations JSONB array/check.
6. `20260917000000_private_documents.sql`: transactional documents/chunks, owner RLS,
   private PDF bucket and invoker claim/complete/search RPCs.

Document constraints: auth.users owner FK, unique generated owner/id/source.pdf path,
filename 1–255, size 1–10 MiB, status check, error <=200, pages 1–200, lease/timestamps,
composite id/owner unique and owner/created index. Chunks: composite parent/owner cascade
FK, unique document/order, index 0–799, page 1–200, content 1–1000, generated English FTS,
GIN and owner/document indexes. Both have authenticated owner ALL policies; anon revoked.
Storage policies: owner-prefix SELECT/DELETE; INSERT additionally requires exact registered
queued path. Private PDF-only 10 MiB bucket, no UPDATE policy. RPCs revoke PUBLIC/anon,
explicitly check owner; completion locks token/row and replaces chunks atomically; search
caps query at 500 chars/eight hits and only ready/incomplete. Effective grants untested.

Fresh project requires managed auth/storage roles/schemas, publication and extensions.
No DROP TABLE/COLUMN or TRUNCATE found. Policy/trigger replacements affect authorization.
Unconditional attachment backfill modifies all existing statuses: unsafe to replay on
populated data. Cleanup DELETEs inside functions execute only on invocation. Documents DDL
fails on collisions. No SQL runtime available: compatibility and RLS NOT VERIFIED.

## Findings / disposition

| Severity | Finding | Status / next step |
| --- | --- | --- |
| Medium | Shared wildcard CORS | FIXED LOCALLY; five unit and one HTTP handler integration test PASS. Explicit ALLOWED_ORIGINS mandatory before deploying any consumer. JWT/RLS remain authorization. |
| High | Analytics views run under owner privileges; no-policy comments do not make views private | OPEN: restrict grants/use reviewed invoker views; verify effective privileges. |
| High | Legacy privileged attachment download trusts stored path after checking parent room only | OPEN: bind path to parent IDs and use caller-authorized storage; audit signed URLs. Do not reuse for private library. |
| High | Legacy admin supersedes_id update not constrained to authorized conversation | OPEN: constrain conversation/AI target; add Edge integration coverage. |
| Medium | Owner-editable document IDs, status, tokens, provenance and own chunks/completion | OPEN: immutable identity/restricted transitions and reviewed worker identity. Isolation is not authenticity. |
| Medium | Non-atomic deletion, orphan files and upload/delete races | OPEN: durable reconciliation and concurrency tests; existing deletion status supports retry only. |
| Medium | No cumulative quota/processing rate limit | OPEN: serialized accounting/worker budgets. |
| Medium | Historical backfill and partial replay idempotence | Documented: empty test, ordered history only; never reset/repair to force matching. |
| Medium | Message/invite count limits and invite consumption not serialized | OPEN: atomic counters and concurrency tests. |
| Medium | Membership self-table comparison/identity mutation and message destination update | OPEN: DB old/new-row and recursion tests, restricted identity columns; no live bypass claimed. |
| Medium | Attachment hybrid RPC does not fuse duplicate legs; context count return/path compatibility; admin caller lacks user auth.uid | OPEN: SQL execution tests and caller-JWT retrieval, not removal of membership checks. |
| Medium | Legacy raw error logging, chunk truncation, ignored completion RPC errors | OPEN: fixed safe codes/incomplete status/persistence checks. Private processor already maps fixed codes and rejects chunk overflow. |
| Low | Definer helpers pin public search_path but public CREATE/execute grants need review | OPEN: effective least-privilege checks. Document RPCs remain invoker. |
| Medium | Permissive browser/middleware env detection; refresh cookies not copied into redirects | OPEN: strict config/Auth refresh tests. Setup script checks key format before dry run. |

SQL fixes deferred rather than claiming safety for unexecuted privilege changes. Review
and disposable role-based tests required before release. No RLS bypass introduced.
