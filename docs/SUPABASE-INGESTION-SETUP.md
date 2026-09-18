# Final session results — supersedes interim checkpoints below

- No migration application, project linking, deployment, reset, or ingestion acceptance.
  CLI authentication PASS; env/link/config MISSING; dry run BLOCKED, not executed this session.
- Final Vitest: **226 passed / 22 files**, including five CORS units and one actual-handler
  local HTTP integration test with stubbed Deno/auth/extraction. This is NOT hosted Edge validation.
- Final type-check, Next build, lint error gate, 68 token-contrast pairs and git diff --check:
  PASS. Real PyMuPDF/pypdf fixture verification PASS (4147 bytes, three pages).
- Full Playwright EXECUTED: **5 passed, 4 failed, 29 skipped**, exit 1; one outside-test
  error reported. Failures: app axe contrast light (8 nodes)/dark (7 nodes), and two group
  AI-mention timeouts. Public light/dark scans passed. No full E2E success claim.
- Latest isolated reduced-motion login rendering test PASS after scoped CSS fix. Earlier
  hook-based fix caused hydration mismatch and was replaced with SSR-consistent markup.
- UI work exceeded the initially intended setup scope: corrected 1099 old Tailwind variable
  references across 44 TSX files to explicit var() syntax. Token values/branding untouched.
  Built invalid custom-property declarations fell from 131 to zero. Added pricing/changelog
  h1 semantics, removed invalid FAQ wrapper, and scoped Auth reduced-motion CSS.
- Updated three existing selected-state class expectations to matching Tailwind syntax,
  preserving positive and negative checks. Added login computed-style/axe browser test.
  ESLint now excludes generated Playwright report assets, not application code.
- Terminology source sweep: zero Confluence matches in src TS/TSX/CSS. Existing unrelated
  working-tree changes remain; no broad restore, commit, push or modification of another repo.
- Additional changed files: `D:\AARAGATE\eslint.config.mjs`,
  `D:\AARAGATE\e2e\login-rendering.spec.ts`,
  `D:\AARAGATE\tests\dialog-focus-regression.test.tsx`,
  `D:\AARAGATE\tests\document-processor-cors.integration.test.ts`,
  `D:\AARAGATE\src\app\globals.css`, and the TSX files described above.
- Warnings remain: Next middleware deprecation, Vite config warning, jsdom canvas limitation,
  PyMuPDF fitz deprecation. Deno/Docker/psql unavailable; SQL/RLS/storage unexecuted.

Next step: privately configure required variables and confirm the dedicated test target,
then initialize/review/link and run ONLY the guarded dry run described below. Migration
application requires a successful reviewed remote plan AND explicit user approval.

---


# Latest DevOps checkpoint — supersedes historical status below

**BLOCKED: linking and dry run. No migration applied, reset, user data deleted, function
deployed, or ingestion acceptance performed.**

## Current state

- Workspace `D:\AARAGATE`, branch `main`, remote `https://github.com/Crusty-chirayu/AARAGATE.git`.
  Existing uncommitted UI/branding, quality-gate and ingestion work preserved. No commit/push.
- Node 24.16.0, npm 11.13.0, Next 16.3.3, Supabase CLI 2.117.0.
- CLI authentication PASS (`projects list --output json`); response held in memory only,
  not printed/saved. No target selected from the list.
- `.env.local` MISSING; ignored PASS; untracked PASS. Local config and exact
  `supabase/.temp/project-ref` file MISSING. A `.temp` directory alone is not a link.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF`,
  `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`: MISSING. Cached CLI login works.
- Deno, Docker, psql MISSING. Current dry run BLOCKED / NOT RUN: no verified target.
  The previous missing-link exit 1 below is historical, not this session's result.

## Next safe steps

Privately create `D:\AARAGATE\.env.local` from `D:\AARAGATE\.env.example` with the
two frontend values. Never use a service-role/secret key in NEXT_PUBLIC variables.
Set `SUPABASE_PROJECT_REF` privately in the CLI process; set `SUPABASE_DB_PASSWORD`
there only if required. Never paste values into chat or command arguments. Raw CLI does
not load Next's env file. Restart Next after configuration.

Manually verify Dashboard identity: dedicated new AARAGATE test project, not production.
Then initialize once, review generated Auth/API/storage/JWT configuration, and link only
that explicit target. Stop after any failed command:

```powershell
supabase init --workdir "D:\AARAGATE"
supabase link --workdir "D:\AARAGATE" --project-ref $env:SUPABASE_PROJECT_REF
node D:\AARAGATE\scripts\check-supabase-setup.mjs --dry-run
```

The script loads local env privately and reports names/statuses only. It requires URL/ref
agreement, matching exact link file, Git safety and an accessible project named AARAGATE
with test/dev/staging and without prod. This conservative naming gate is NOT proof of
nonproduction identity; Dashboard confirmation remains mandatory. Key checks are structural,
not signature validation; hosted URLs are limited to `<ref>.supabase.co`. No auto-linking.
Exit 0 means the report completed; inspect JSON dryRun.status for PASS/BLOCKED/FAIL.

Only after those prerequisites it invokes:

```powershell
supabase db push --workdir "D:\AARAGATE" --linked --dry-run
```

Raw output is withheld; known migration filenames, exit status, warning/error categories
are reported. A dry run lists pending SQL; it does not execute SQL or validate RLS.
There is NO remote plan yet. After a successful reviewed plan and explicit approval only:

```powershell
supabase db push --workdir "D:\AARAGATE" --linked
```

Never combine dry run/apply unattended or use reset/history repair to force a match.
After partial failure inspect migration history and fix forward. Do not replay initial
schema over hardening policies. Git reversion does not roll back SQL. Preserve backups
before any future changes to populated environments.

## Changes and validation

- Shared Edge CORS now denies unlisted browser origins; missing configuration or `*` grants
  no access. Origin-less clients still require JWT authorization. CORS is defense in depth,
  not authentication; the former wildcard did not itself expose JWTs.
  Set `ALLOWED_ORIGINS` explicitly before deploying ANY shared-helper consumer.
- Added five CORS tests, a secret-safe setup check, and corrected example branding.
  No historical migration or UI implementation changed this session.
- Baseline 220 passed. CORS red: 4 failed/1 passed; green: 5 passed.
  Final full suite **225 tests / 21 files PASS**, exit 0.
- Type-check initially failed because Node tests imported a Deno global. Narrow module-local
  declaration fixed it; subsequent type-check/build PASS. ESLint error gate PASS with
  existing effect warnings. Contrast 68 pairs PASS. Git diff whitespace check PASS.
- Next build PASS; middleware deprecation remains. Vite/jsdom canvas warnings remain.
- Fixture PASS with real PyMuPDF/pypdf: 4147 bytes, three pages.
- Playwright EXECUTED in isolated demo mode: **FAIL, exit 1; four accessibility failures,
  32 tests did not run**, plus an error outside a test. Rendered contrast failures captured.
  Diagnostics: `D:\AARAGATE\playwright-report`, `D:\AARAGATE\test-results` (ignored).
  Token contrast and mocked axe success do not establish browser accessibility.
- Deno tests/checks, real Deno PDF.js, live SQL/RLS/storage/Auth, ingestion acceptance:
  NOT RUN / NOT VERIFIED. No deployment-ready or document-grounding claim.

Findings: `D:\AARAGATE\docs\SUPABASE-SECURITY-REVIEW.md`.

---


# Supabase document-ingestion test setup

## Latest setup-stage check

- Supabase CLI version **2.117.0** verified. `projects list --output json` exited 0 and returned a project list; CLI authentication is working. Project details were captured privately and not printed. `SUPABASE_ACCESS_TOKEN_PRESENT=false` does not mean logged out: the CLI has another configured authentication source.
- `.env.local`: ignored=true, untracked=true, exists=false.
- Presence checks: `NEXT_PUBLIC_SUPABASE_URL=false`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=false`, `SUPABASE_ACCESS_TOKEN=false`, `SUPABASE_PROJECT_REF=false`, `SUPABASE_DB_PASSWORD=false`. These are presence booleans, not credential values.
- Supabase local config exists=false; link-reference file exists=false. No target reference was supplied, so project identity/matching cannot be verified. No project was selected or linked automatically.
- Ran exactly `supabase db push --workdir "D:\AARAGATE" --linked --dry-run` through a bounded non-interactive process. **Exit 1: missing linked project reference.** No remote migration plan returned; six local migration files were detected in the order listed below. CLI dry-run flag support was checked first.
- No database apply, deployment or acceptance test performed. The dry-run failure must be resolved before requesting migration-apply approval.

### Local configuration needed now

1. In VS Code, create `D:\AARAGATE\.env.local` privately and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` using the new test project's URL and browser-safe anon key. Do not put service-role/secret keys into either field. Do not paste values into chat. Restart Next after saving.
2. Set `SUPABASE_PROJECT_REF` in your local process to the intended test project reference. Configure `SUPABASE_DB_PASSWORD` privately if needed for non-interactive linking/database access. The CLI is already authenticated; a new access token is not currently required. Values set in a separate terminal may not propagate to an already-running VS Code process; ensure the subsequent CLI process inherits them. The CLI does not automatically load Next's env file.
3. Later initialize the absent local config with `supabase init --workdir "D:\AARAGATE"`, review it, and link only the intended empty test project using the guarded sequence below. These commands were not run during this checkpoint because no project reference was configured.
4. The next database command remains **the dry run**, not apply: `supabase db push --workdir "D:\AARAGATE" --linked --dry-run`. Review a successful result and obtain approval before running the apply command documented below.


## Review outcome

**Preparation/review only. No migrations applied, project linked, secrets configured, functions deployed, or acceptance tests run.** This document does not certify a deployment-ready schema.

The entire 116-line pending migration at `D:\AARAGATE\supabase\migrations\20260917000000_private_documents.sql` was inspected, along with the caller-bound processor, frontend clients, middleware, authentication callback and shared Edge client/CORS configuration.

The migration is additive and structurally suitable for review on an empty, dedicated Supabase test project. It is **not idempotent** and has integrity/operational gaps below. Database execution and two-user RLS/storage isolation remain unverified. Do not apply it to production or treat static inspection as an acceptance pass.

## Environment variable names and placement

| Name | Location | Required for this ingestion test? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `D:\AARAGATE\.env.local` | Yes: project API URL used by browser, Next server client and middleware. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `D:\AARAGATE\.env.local` | Yes: browser-safe project anon key; NEVER a service-role or secret key. Use the legacy anon key for the existing gateway configuration until newer key compatibility is tested. |
| `SUPABASE_URL` | Hosted Edge runtime | Yes; supplied by Supabase, not copied from Next automatically. |
| `SUPABASE_ANON_KEY` | Hosted Edge runtime | Yes; shared `userClient` forwards the caller's Authorization JWT with this project key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Hosted Edge runtime only | Read by the shared helper for other features, but **not used by document-processor**. Do not place it in frontend configuration or use it for ingestion tests. |
| `ALLOWED_ORIGINS` | Edge Function environment | Set explicitly to intended frontend origins, comma-separated. Otherwise the helper defaults to `*`. This is not an authorization substitute. |
| `SUPABASE_ACCESS_TOKEN` | Local CLI process/secure CLI login | CLI management authentication for linking/deployment; not an app variable. |
| `SUPABASE_PROJECT_REF` | Local CLI process | Required by the explicit commands below to identify the dedicated test project; not read by app clients. |
| `SUPABASE_DB_PASSWORD` | Local CLI process | Needed for non-interactive linked database operations unless already securely configured by the CLI. Not read by the app. |

No AI-provider or embedding key is required to upload, parse, persist chunks or run the new document FTS RPC. AI integration is not part of this setup checkpoint. Never put privileged keys, database passwords or management tokens in any `NEXT_PUBLIC_*` variable.

### Client behavior inspected

- `D:\AARAGATE\src\lib\env.ts`: reads the two `NEXT_PUBLIC_*` variables; configuration requires URL starting with `http` and key length over 20. This heuristic does not validate project identity or key safety.
- `D:\AARAGATE\src\lib\supabase\client.ts`: cached browser client using those values.
- `D:\AARAGATE\src\lib\supabase\server.ts`: cookie-bound server client using the same public credentials, not service-role credentials.
- `D:\AARAGATE\src\middleware.ts`: independently reads the same variables, refreshes user auth and guards protected routes.
- `D:\AARAGATE\src\app\auth\callback\route.ts`: exchanges the auth code through the server client.
- `D:\AARAGATE\supabase\functions\_shared\supabase.ts`: `requireUser` verifies the JWT using `auth.getUser()` and returns the caller client. Document processing uses this client for database, storage and RPC operations.

Restart Next after configuring local variables; rebuild before testing a production build. CLI commands do not automatically source Next's `.env.local`.

### Git and boolean-only verification

`D:\AARAGATE\.gitignore` lines 39–41 contain `.env*` with only `!.env.example` excepted. Effective Git checks confirmed **ENV_LOCAL_IGNORED=true** and **ENV_LOCAL_TRACKED=false**. The matched rule is `.gitignore:40:.env*`. Ignore rules do not protect force-added files; never use `git add -f` for credentials.

Value-redacting inspection confirmed `D:\AARAGATE\.env.example` defines exactly `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. After loading Next's environment configuration, boolean checks reported:

- `ENV_LOCAL_EXISTS=false`
- `NEXT_PUBLIC_SUPABASE_URL_PRESENT=false`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY_PRESENT=false`
- `SUPABASE_CONFIG_TOML_EXISTS=false`

No secret values were printed. CLI credential presence and hosted runtime variables have not been verified.

For later local rechecks, this command uses Next's own loader and prints booleans only (do not paste configuration values into chat):

```powershell
Set-Location 'D:\AARAGATE'
node -e "const cp=require('child_process'); require('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}}); for(const n of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY']) console.log(n+'_PRESENT='+Boolean(process.env[n]?.trim())); const a=cp.spawnSync('git',['check-ignore','--no-index','-q','.env.local']); console.log('IGNORE_CHECK_OK='+(a.status===0)); const b=cp.spawnSync('git',['ls-files','--','.env.local'],{encoding:'utf8'}); console.log('TRACKING_CHECK_OK='+(b.status===0)); console.log('ENV_LOCAL_UNTRACKED='+(b.status===0 && !b.stdout.trim()));"
```

A presence check is not a credential-validity test. Do not dump `env`, use `Get-Content .env.local`, print CLI status credentials, enable secret-bearing debug logs, or commit credentials.

## Pending document migration: complete object review

### Tables, constraints and indexes

- `public.documents`: UUID PK; owner FK to `auth.users` with account-delete cascade; owner defaults to `auth.uid()`; filename length 1–255; size 1–10,485,760 bytes; six allowed states; processing lease/token/error, physical page count 1–200, missing-page array and timestamps. Generated unique storage path: `owner UUID/document UUID/source.pdf`. Composite uniqueness `(id,user_id)` supports the chunk FK. Index `documents_owner_created(user_id,created_at DESC)` supports the user list.
- `public.document_chunks`: UUID PK; composite `(document_id,user_id)` FK with cascade; index 0–799; physical page 1–200; text length 1–1000; generated English tsvector; timestamp; unique `(document_id,chunk_index)`. GIN index `document_chunks_fts` and B-tree `document_chunks_owner(user_id,document_id)`. Primary/unique constraints also create indexes.
- No separate jobs table: document status, timestamp and token implement a synchronous five-minute retry lease.
- `storage.buckets`: inserts private `documents` bucket, PDF MIME allowlist, 10 MiB limit.

### RLS and grants

| Policy | Operation | Boundary |
| --- | --- | --- |
| `documents_owner` | ALL, authenticated | USING and WITH CHECK require `user_id = auth.uid()`. RLS enabled. |
| `document_chunks_owner` | ALL, authenticated | Same owner predicate; composite FK prevents cross-owner document references. RLS enabled. |
| `documents_storage_read` | SELECT, authenticated | Documents bucket and first path folder equals caller UUID. |
| `documents_storage_insert` | INSERT, authenticated | Same prefix plus owned queued document with exact generated storage path. |
| `documents_storage_delete` | DELETE, authenticated | Same bucket/owner prefix; allows removal of owner orphans. |

No new Storage UPDATE policy: under this policy set, overwrite is not authorized. Policies on a manually modified project may combine permissively; inspect actual policies before assuming these are exclusive.

Anonymous table privileges are revoked. Authenticated document SELECT/INSERT/UPDATE/DELETE and chunk SELECT/INSERT/DELETE are granted. Grants are additive: Supabase default privileges may include chunk UPDATE, and the ALL policy permits owner UPDATE if granted. Check effective privileges; do not use service_role/table owners to prove RLS isolation.

### RPCs

- `claim_document(uuid)`: SECURITY INVOKER; atomically claims owned queued/failed or stale-processing rows; random token or null; clears error and records start time.
- `search_documents(text)`: stable SECURITY INVOKER; ownership on both tables plus RLS; ready/incomplete only; English websearch query capped at 500 characters; maximum eight ranked chunks with document/page/chunk references.
- `complete_document(uuid,uuid,integer,integer[],jsonb)`: SECURITY INVOKER; locks owned processing row matching token; checks page/chunk bounds; replaces chunks and sets ready/incomplete atomically. Invalid page references throw and roll back. JSON ordinality creates contiguous indexes. Clears token/error on completion.
- All functions set `search_path = public`; EXECUTE revoked from PUBLIC/anon, granted to authenticated. No new SECURITY DEFINER or service-role path.

## Security and integrity findings — not fixed in this review

1. No apparent missing cross-owner rule in new tables/RPCs on static review; **not a live RLS pass**. No shared-room access to private-library content.
2. Owner can directly modify status, token, metadata and chunks or invoke completion. RLS protects privacy, **not extraction authenticity**. Never certify these records as official/verified. Stronger provenance needs a separately reviewed authority design, not a service-role shortcut.
3. Storage/DB deletion is not atomic. Direct metadata/account deletion cascades chunks but not storage objects; concurrent upload/delete can orphan files. Storage delete does not require deleting status, so ready metadata can outlive its file. Review cleanup/race recovery before release.
4. Generated path does not make identity immutable: owner can change document id where constraints permit, changing the derived path without moving the object. No immutable identity or full state-transition enforcement.
5. Filename safety/extension is checked by client/processor, not SQL (length only). Missing-page duplicates/coverage and total page coverage are not fully validated. Whitespace chunks pass length checks; JSON permits extra fields. Direct owner writes can create inconsistent metadata.
6. No per-user total quota, processing-call rate limit or durable worker. MIME/signature checks are not malware scanning. Real Edge memory/time limits remain untested.
7. English lexical FTS is not semantic/math retrieval. No match does not prove absence of source facts. Private search is not connected to AI chat.
8. Earlier attachment migration unconditionally marks old attachments unsupported. Apply ordered history only to a confirmed empty test project; never blindly replay on populated data.
9. Plain CREATE/INSERT inside BEGIN/COMMIT fails on collisions rather than overwriting. Needs Supabase auth/storage and PostgreSQL FTS/UUID infrastructure. Earlier attachment migration requires pgvector, though documents do not.

## Migration order and commands (not executed)

Use the migration history, not `D:\AARAGATE\supabase_schema.sql` plus migrations: mixing the standalone snapshot with tracked history may duplicate policies/objects.

For the full app on a fresh project, apply these files from `D:\AARAGATE\supabase\migrations` in order after approval:

1. `20260101000000_init.sql` — auth profiles, chat tables, original RLS, avatars/attachments buckets and supporting infrastructure.
2. `20260828000000_rls_hardening.sql` — critical authorization fixes and rate limits; do not omit.
3. `20260828000001_pinned_conversations.sql` — per-member pin timestamp.
4. `20260901000000_v3_attachment_understanding.sql` — attachment processing/chunks, FTS/vector indexes, RLS and RPCs; includes the existing-data backfill noted above.
5. `20260901000001_v3_verified_citations.sql` — message citation JSON array.
6. `20260917000000_private_documents.sql` — reviewed private-library objects.

The document migration has no direct dependency on chat tables, but applying it alone does not initialize the existing app's profile/chat behavior. This review does not certify every historical migration. Confirm the actual pending set using the CLI before applying anything.

### Review-first sequence for later use

Use the official Supabase CLI. Check its version/help locally; commands below have not been executed here. There is no `D:\AARAGATE\supabase\config.toml`; later initialize with `supabase init --workdir 'D:\AARAGATE'` and review generated config. Do not force-overwrite existing configuration.

Configure CLI credentials privately in the local process, or use secure CLI login. Next's `.env.local` is not automatically loaded by the CLI. For a non-interactive, environment-based CLI setup:

```powershell
foreach ($name in @('SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD')) {
  $present = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))
  Write-Output ($name + '_PRESENT=' + $present)
  if (-not $present) { throw 'Required CLI configuration is missing.' }
}
```

Manually verify the reference identifies the **new empty test project**, not production. Linking records a target; it does not apply SQL:

```powershell
supabase link --workdir 'D:\AARAGATE' --project-ref $env:SUPABASE_PROJECT_REF
if ($LASTEXITCODE -ne 0) { throw 'Project link failed.' }
supabase migration list --workdir 'D:\AARAGATE' --linked
if ($LASTEXITCODE -ne 0) { throw 'Migration history inspection failed.' }
supabase db push --workdir 'D:\AARAGATE' --linked --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Migration dry-run failed.' }
```

**Stop and review the target/history/dry-run output.** Dry-run lists pending migrations; it does not execute/validate SQL or RLS. Expected fresh history: all six above pending, no unexplained existing objects. Unexpected/nonempty history needs separate review, not reset or migration-history repair.

Only after explicit approval, the apply command is:

```powershell
supabase db push --workdir 'D:\AARAGATE' --linked
```

No `--yes`, `--include-all`, `db reset`, history repair or database password on the command line. Do not combine dry-run/apply into an unattended script. Inspect history if a later migration fails after earlier files apply; do not blindly replay SQL.

## Remaining requirements and validation boundaries

- Configure the two frontend variables locally yourself, restart Next and rebuild any production build. `.env.local` is confirmed ignored and untracked; do not share credentials.
- Verify project identity, empty migration history, auth/storage availability, exposed public schema, required extensions, effective grants and combined storage policies. Keep the documents bucket private and RLS enabled.
- Configure Auth site URL and exact test redirect URLs, including `/auth/callback` and `/reset-password` where used. Enable email auth and prepare two distinct confirmed test accounts. Google OAuth is optional for ingestion.
- Configure `ALLOWED_ORIGINS` in hosted Edge settings. Only after migration approval, deploy `document-processor` with normal JWT verification, not `--no-verify-jwt`. Supabase provides hosted runtime variables; no privileged Next credentials needed.
- Deno is needed for local Edge type/runtime checks; Docker/Podman for a local Supabase stack. Hosted testing does not require local Docker but does not replace Edge validation. Neither local runtime is provisioned by this review.
- Fixture: `D:\AARAGATE\tests\fixtures\aaragate-ingestion-fixture.pdf`; PyMuPDF/pypdf verified it previously. The app's Deno PDF.js parser has not yet been verified against it. No Documents UI or full ingestion harness is delivered.
- Future acceptance: caller-JWT upload, processing, physical pages/chunks/status, owned FTS, anonymous/cross-user denial, private storage read/write/delete, failed persistence, stale leases and deletion cleanup. Never use service-role access to establish a passing ownership test.

Only this setup document is a deliverable of this review. Configuration checks used names/booleans only. Temporary non-secret diagnostic files are removed after verification. No application code, migration, credentials or fixture changed; no project linking, database apply, function deployment or acceptance run performed. Database safety findings are static, not live verification.


