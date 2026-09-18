# AARAGATE — Continuation Checkpoint

> **Project name:** AARAGATE (Aaragate 700)
> **Checkpoint date:** 2026-09-18
> **Branch:** `main` · remote `origin https://github.com/Crusty-chirayu/AARAGATE.git`
> **Supabase CLI:** 2.117.0 · **Node:** 24.16.0 · **npm:** 11.13.0

## Project

AARAGATE is a Next.js 16 / React 19 / Tailwind 4 chat application with Supabase
backend integration. The current development phase is a **UI/UX redesign +
Supabase ingestion hardening + E2E repair** pass that touches:

- The shared design-token → Tailwind CSS layer (CSS variable references).
- The document ingestion pipeline (upload → storage → Edge processing → retrieval → deletion).
- Playwright E2E suite stability and accessibility (axe-core + contrast).

Overall objective: deliver a stable, accessible, visually consistent MVP with the
private document ingestion pipeline configured and hardened, **without touching any
production Supabase project or applying migrations without explicit approval**.

---

## Completed work

### Verified local quality gates
- **TypeScript:** `npx tsc --noEmit` — PASS (exit 0).
- **Vitest:** `npm run test -- --run` — **226 passed / 22 files** (PASS). Includes CORS units, dialog-focus regression, a11y component tests.
- **Contrast:** `node scripts/contrast.mjs` — **PASS, 68 token pairs** across light and dark themes.
- **ESLint:** 0 errors, 17 warnings — all are the pre-existing, intentionally-configured
  `react-hooks/set-state-in-effect` warnings (`src/components/ui/modal.tsx` ConfirmDialog,
  sidebar, settings). Documented in `eslint.config.mjs` as accepted escape hatches.

### Modal shell fix (root-cause fix for group-room invite test)
- **File:** `src/components/ui/modal.tsx`
- **Root cause:** The modal panel had no vertical layout structure; `max-h` constrained
  height without an internal scroll container; and the footer rendered inside the header
  row — so on tall dialogs (group-room settings) the "Create room" button could be pushed
  off-screen / unscrollable.
- **Fix:** Panel is now a flex column with `max-h-[100dvh]`; the body is
  `min-h-0 flex-1 overflow-y-auto`; the `footer` renders once as a `sticky bottom-0` row
  with a raised surface background so the action stays reachable on overflow. The close
  button stays in the header (correct placement).
### Supabase project identity
- CLI authentication status: **PASS** (`supabase projects list` works).
- However, in this environment `projects list --output json` returned **2 projects but
  zero matching "aaragate" names** (the authenticated account's project list does not
  expose a clearly-labeled dedicated AARAGATE test project here).
- **Project identity: NOT VERIFIED.** Linking and migration dry-run remain BLOCKED.
- See Phase 7 below for the exact commands the user must run locally.

### Document ingestion implementation review
- `src/lib/data/documents.ts`: full upload → processing → search → delete workflow
  reviewed. PDF-only validation, `%PDF-` signature check, 255-char filename, 4-space path
  prefix, upsert-free upload, owner-scoped RLS row writes, lease-based claim_document/
  complete_document RPCs reviewed (see security review doc). **Not end-to-end verified
  against a live Supabase project** — the dry run was blocked.

### Security findings (static review only — NOT live-verified)
Documented in `docs/SUPABASE-SECURITY-REVIEW.md`.

| Severity | Finding | Status |
| --- | --- | --- |
| Medium | Shared wildcard CORS | FIXED LOCALLY (narrow origin allow-list) |
| High | Analytics-view exposure / default grants | CONFIRMED OPEN |
| High | Privileged attachment-path handling | CONFIRMED OPEN |
| High | Admin supersedes_id update lacks conversation scoping | CONFIRMED OPEN |
| Medium | Owner-editable document IDs / provenance | CONFIRMED OPEN |
| Medium | Non-atomic storage/database deletion | CONFIRMED OPEN |
| Medium | Missing cumulative quotas / processing budgets | CONFIRMED OPEN |
| Medium | Concurrency / race conditions | CONFIRMED OPEN |
| Medium | Historical backfill / partial replay idempotence | DOCUMENTED RISK |

No migrations were applied. No RLS bypass introduced.

---

## Current state (what was in progress when paused)

The session was paused mid-way through **Phase 6 — fixing remaining Playwright failures**.
The Modal fix resolved several group-room/accessibility failures, but **Playwright E2E
still reports failures** (the `.last-run.json` at the checkpoint shows 9 failed entries).
These were not all root-caused at the time of pausing.

### Files modified (working tree)
- `src/components/ui/modal.tsx` — Modal shell layout fix (the completed fix).
- `src/components/ui/button.tsx`
- `src/app/globals.css` — CSS token reference fixes.
- `src/app/app/page.tsx`, `src/app/app/layout.tsx`, `src/app/app/settings/page.tsx`
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`, etc.
- All `src/components/**` files (token reference normalization, accessibility refinements).
- `e2e/*.spec.ts`, `e2e/helpers.ts`
- `eslint.config.mjs`, `package.json`, `README.md`, `.env.example`
- `supabase/functions/_shared/*.ts`

Full diff statistics at checkpoint: 62 files changed, 1295 insertions, 875 deletions.

### Pending implementation (NOT started / incomplete at pause)
- Supabase project linking (`supabase link`) — BLOCKED on user providing project ref locally.
- Migration dry-run (`supabase db push --linked --dry-run`) — BLOCKED; requires linked target.
- Edge Function deployment of `document-processor` — NOT done; requires migration approval first.
- Remaining Playwright failures (sign-out redirect, fonts, perf, interaction-regression
  sidebar toggle) were identified but **not all fixed** at pause.

---

## Remaining work (prioritized)

1. **Supabase environment configuration (user action required).**
   Set these in your local PowerShell session only (values from your Supabase dashboard —
   never paste into chat):
   ```powershell
   $env:NEXT_PUBLIC_SUPABASE_URL = "YOUR-URL"
   $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "YOUR-ANON-KEY"
   $env:SUPABASE_PROJECT_REF = "YOUR-PROJECT-REF"
   $env:SUPABASE_DB_PASSWORD = "YOUR-DB-PASSWORD"
   $env:SUPABASE_ACCESS_TOKEN = "YOUR-ACCESS-TOKEN"
   ```
   Then: `node scripts/check-supabase-setup.mjs --dry-run` to verify.

2. **Link + dry run (requires user approval to apply).**
   ```powershell
   supabase init --workdir "D:\AARAGATE"
   supabase link --workdir "D:\AARAGATE" --project-ref $env:SUPABASE_PROJECT_REF
   supabase db push --workdir "D:\AARAGATE" --linked --dry-run
   ```
   **STOP and get explicit user approval before running `supabase db push --linked` (no --dry-run).**

3. **Complete remaining Playwright E2E fixes.**
   - `e2e/interaction-regression.spec.ts:56` — sidebar toggle / "Show sidebar" button not found.
   - `e2e/fonts.spec.ts:12` — body computed font stack does not contain `inter`.
   - `e2e/perf.spec.ts` — 4× CPU throttle frame-budget guard (measurement; review baseline).
   - Re-run the full suite to get the current exact failing-test list (names may have shifted).

4. **Complete security hardening (additive migrations only).**
   - Review analytics-view grants.
   - Bind attachment storage paths to parent IDs.
   - Scope admin message updates to authorized conversation.
   - Make document IDs / provenance immutable (additive migration, not a historical rewrite).
   - Add cumulative processing quotas / worker budgets.
   - Add concurrency tests for invite counters and message limits.
   These are static-review findings; verify with live tests against the linked test project.

5. **End-to-end ingestion verification.**
   Against the linked test project: caller-JWT upload → claim → PDF validation →
   chunk persistence → owned FTS search → cross-user denial → private storage delete.
   Fixture: `tests/fixtures/aaragate-ingestion-fixture.pdf`.

6. **Documentation updates.**
   - Refresh `docs/SUPABASE-INGESTION-SETUP.md` with the actual linking/dry-run output once verified.
   - Update this checkpoint document once remaining work lands.

---

## Testing

| Gate | Command | Result at checkpoint |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | PASS |
| Vitest | `npm run test -- --run` | 226 passed / 22 files |
| Contrast | `node scripts/contrast.mjs` | PASS (68 pairs) |
| ESLint | `npx eslint --max-warnings=0 src tests scripts e2e` | 0 errors, 17 pre-existing warnings |
| Playwright E2E | `npx playwright test` | FAILED — 9 entries in `.last-run.json` (re-run needed for current list) |
| Supabase setup | `node scripts/check-supabase-setup.mjs --dry-run` | BLOCKED — env MISSING, project identity NOT VERIFIED |
| Migration dry-run | `supabase db push --linked --dry-run` | NOT RUN (no linked project) |

**Known unresolved failures at checkpoint:** not all Playwright failures were root-caused
before pause (see "Remaining work"). Re-run the full E2E suite after resuming to obtain
the current, exact failing-test list.

---

## Continuation instructions

1. **Resume.** Continue from the actual repository state — re-run `tsc`, `vitest`, and
   the full `playwright test` suite at the start of the next session (do not trust
   stale `.last-run.json`).
2. **Configure Supabase credentials** (local environment only) using the commands in item 1.
3. **Link + dry run** — get explicit user approval before applying migrations.
4. **Fix remaining Playwright failures** one at a time at the root cause; re-run the
   targeted spec after each fix (do not weaken assertions or broaden timeouts blindly).
5. **Commit incrementally** for each fix; this checkpoint captures the Modal shell fix +
   the broader token/tokenization pass.
6. Preserve the intentional ESLint `set-state-in-effect` warnings — documented escape hatches.

---

## Git checkpoint

- **Branch:** `main`
- **Latest checkpoint commit:** created at this checkpoint (see `git log --oneline -1`).
- **Uncommitted changes after checkpoint commit:** none expected (all working-tree changes
  included; `test-results/` and `.next/` are gitignored).
- **No `.env.local` created** — environment variables remain MISSING; the app runs in
  DEMO MODE for local dev and E2E (per `playwright.config.ts`, which forces blank Supabase
  env vars for the webServer).
- **Repository is ready to resume.**

## Commands executed during this checkpoint

```text
git status --porcelain=v1
git diff --stat HEAD
git diff -- src/components/ui/modal.tsx
npx tsc --noEmit --pretty false          (PASS)
npx eslint --max-warnings=0 src tests scripts e2e  (0 errors, 17 pre-existing warnings)
node scripts/contrast.mjs                (PASS, 68 pairs)
npm run test -- --run                    (226 passed / 22 files)
node scripts/check-supabase-setup.mjs --dry-run  (BLOCKED — env MISSING)
```
