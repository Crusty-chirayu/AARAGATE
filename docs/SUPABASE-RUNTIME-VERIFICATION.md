# Supabase runtime verification — the practice/attempt path

**Status: NOT RUN.** Every statement in this file is a *procedure to execute*,
not a result. The code path it verifies is currently **statically validated
only**. Do not read this document as evidence that anything below works.

## Why it has not run

The local Supabase stack is Docker-based and this machine has no container
runtime. Probed once, verbatim:

```
$ supabase start
failed to inspect container health: docker: command not found
(podman also not found) — install Docker Desktop or Podman and ensure it is on PATH
```

| Requirement | State on this machine |
|---|---|
| Supabase CLI | **present** — 2.117.0 (`supabase`, and `npx supabase`) |
| Docker / Podman | **absent** (`docker` is not a recognized command) |
| WSL | **not enabled** ("WSL1 is not supported with your current machine configuration") |
| `psql` / `pg_ctl` / `initdb` | **absent** — so no bare local Postgres either |
| Deno | **absent** — `supabase/functions` cannot be typechecked or served locally |

Because `supabase start`, `supabase functions serve` and `supabase db reset` all
require the container runtime, **none of the server path has ever executed**: the
migration has not been applied anywhere, and `practice-generator` has never run.

## Safety

Everything below is **local only**. The stack listens on 127.0.0.1 and uses the
throwaway local credentials Supabase generates. **Never** run `supabase link`,
`supabase db push`, `supabase functions deploy`, or `db reset` against a linked
remote project — `db reset` is destructive and is safe *only* against the local
stack created by `supabase start`.

## Procedure

### 1. Bring up the stack and apply migrations locally

```bash
supabase start          # starts Postgres :54322, API :54321, Studio :54323
supabase db reset       # applies supabase/migrations/*.sql in order, locally
```

`db reset` must report every migration applied with no error. The practice flow
depends on two pre-existing migrations too:
`20260917000000_private_documents.sql` (creates `documents` / `document_chunks`,
the FK target of `quiz_attempts.source_document_id`) and
`20260828000000_rls_hardening.sql`.

### 2. Verify the objects actually exist

Open Studio (http://127.0.0.1:54323 → SQL editor) or
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

```sql
-- tables + RLS enabled
select relname, relrowsecurity from pg_class
 where relname in ('quiz_attempts', 'quiz_attempt_items');

-- policies: items must have insert/delete only — NO select, NO update
select tablename, policyname, cmd from pg_policies
 where tablename like 'quiz_attempt%' order by tablename, policyname;

-- table privileges: items need INSERT/DELETE for authenticated and no SELECT
-- for anyone but the owner; anon must have nothing
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_name like 'quiz_attempt%' order by table_name, grantee, privilege_type;

-- RPCs: security definer, pinned search_path
select proname, prosecdef, proconfig from pg_proc
 where proname in ('get_quiz_attempt', 'submit_quiz_attempt',
                   'quiz_score_question', 'quiz_round_marks');
```

Expected: `relrowsecurity = true` for both tables; no `SELECT`/`UPDATE` policy on
`quiz_attempt_items`; no `SELECT` privilege on `quiz_attempt_items` for
`authenticated`; `prosecdef = true` and a `search_path=` entry for both RPCs.

### 3. Create two users and capture their tokens

```bash
API=http://127.0.0.1:54321
ANON=$(supabase status --output json | jq -r .anon_key)

# repeat for a second address — this checklist needs two distinct owners
curl -s "$API/auth/v1/signup" -H "apikey: $ANON" -H 'content-type: application/json' \
  -d '{"email":"a@example.test","password":"password123"}'
```

### 4. Answer-key protection (the core claim)

With user A's JWT:

1. **Write an attempt and its keyed snapshot the way `practice-generator` does** —
   one `POST /rest/v1/quiz_attempts`, then `POST /rest/v1/quiz_attempt_items` with
   a `question` object that *contains* `answer`, `nat_range` and `explanation`.
   Both must return 201. A `permission denied for table ...` here means the table
   grants in `20260920000000_quiz_attempts.sql` are wrong.
2. **`GET /rest/v1/quiz_attempt_items?attempt_id=eq.<id>` as user A → must return
   zero rows** (no select grant *and* no select policy; the request should be
   refused or empty, never the snapshot).
3. **`POST /rest/v1/rpc/get_quiz_attempt` as user A, before submitting → the
   returned `questions[]` must contain no `answer`, `nat_range` or `explanation`
   key at all** (the RPC *removes* them — `- 'answer'` is removal, not blanking).
4. **`get_quiz_attempt` with no `Authorization` header → must fail** (the RPC
   raises `42501`), i.e. anon cannot read an attempt.
5. **`get_quiz_attempt` for A's attempt id, authenticated as user B → must return
   `null`**, and must never reveal A's rows.

### 5. Submission and server-side scoring

1. `POST /rest/v1/rpc/submit_quiz_attempt` as A with
   `{"p_attempt_id": "<id>", "p_responses": {"0": {"kind":"options","selected":["B"]}}}`
   → the returned `result` must equal what `src/lib/quiz.ts` computes for the same
   paper, and the returned `questions[]` must **now** include the key (the review
   screen needs it).
2. **Re-submit the same attempt → must fail with "This attempt has already been
   submitted."**, and the stored `result` must be unchanged.
3. **`PATCH /rest/v1/quiz_attempts?id=eq.<id>` with `{"result": {"awarded": 999}}`
   as A → must not modify the row** (no UPDATE policy).
4. **Missing response keys** → untouched questions must score as *unanswered*
   (0), never as a penalty.
5. **A numeric response to an MCQ** (or an options response to a NAT) → scores as
   *unanswered*, matching `quiz_score_question`'s kind-mismatch rule.
6. **An MCQ wrong answer** → `awarded` must be `round(-marks/3)`, and no other
   kind may be negatively marked.

### 6. The Edge Function

```bash
supabase functions serve practice-generator --env-file supabase/functions/.env.local
```

With no provider secret configured, verify:

1. **No `Authorization` header → 401**, and no row is created.
2. **An invalid config** (missing `branch`, all-zero counts, 999 questions) → 400
   `invalid_config`, and no row is created.
3. **A valid config with no provider secret** → 500 naming the missing env var
   (the legible-missing-secret fix), and **no row is created** — the model call
   happens *before* `persistAttempt`, so a failure stores nothing.
4. **On success the response must contain `attemptId` and must NOT contain
   `questions`** — the browser is handed a paper id, never the keyed snapshot.

The provider success path cannot be verified without a model. Doing so safely
needs either a local OpenAI-compatible stub or a configurable provider base URL;
the registry currently pins vendor URLs, so that would be a real code change,
deliberately **not** made here.

## Already covered without a runtime

`tests/quiz-attempts-schema.test.ts` (17 tests) parses the migration and the Edge
Function and asserts, statically: RLS is enabled on both tables; no SELECT/UPDATE
policy on the keyed snapshot table; the insert grant exists and no SELECT grant
does; anon is revoked; both RPCs are `security definer` with a pinned
`search_path`; the helpers' PUBLIC execute is withdrawn; the read path removes
`answer`/`nat_range`/`explanation`; the submit path takes `for update` and rejects
a second submission; scoring reads only the stored snapshot; and every column the
Edge Function inserts is declared by the DDL.

`tests/generation.test.ts` (21) and `tests/practice-security.test.ts` (7) cover
the client contract: generation returns an attempt id and no question payload,
and `createAttempt` refuses to write a keyed snapshot from the browser.

**None of that is runtime verification.** It shows the statements are present and
consistent; it cannot show PostgreSQL accepts them.
