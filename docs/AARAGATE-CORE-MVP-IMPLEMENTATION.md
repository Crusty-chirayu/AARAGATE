# AARAGATE Core MVP implementation

## Audit — 2026-09-17

Implementation ledger, not a deployment claim. Existing uncommitted branding/UI and quality-gate changes are preserved. No production migration is applied here.

### Existing capabilities and safe reuse

- Next.js 16 / React 19 / Tailwind 4. Supabase browser and cookie-bound server clients. Most operations use `src/lib/data/api.ts` plus authenticated Edge Functions, not Next server actions.
- Authentication uses `auth.getUser()`. Chat access derives from conversation membership. Existing hardening migrations restrict membership creation, role updates, assistant impersonation, profile reads and reactions. Preserve these.
- Private `attachments` bucket and `attachment_chunks` are **conversation-member scoped**, not private to one user. Do not reuse them for the private library. Avatars are public.
- Existing PDF.js 4.8.69 Deno import and page-aware chunker can be reused after repairs. Audit found placeholder fallback text on parser failure, missing physical page counts, no extraction work limits, and silent chunk truncation in the old attachment processor.
- Existing attachment FTS/vector RPCs demonstrate retrieval patterns. New library search should be indexed FTS only, SECURITY INVOKER, caller JWT, explicit ownership plus RLS.
- `_shared/provider.ts` is a pure tested OpenRouter request/SSE adapter. Keys/moderation run on Edge Functions. Never feed private document context into shared-room messages: other members would see it.
- Attachment context/citations are reusable patterns, but document IDs must not masquerade as attachment IDs. Source retrieval does not certify official/correct answers.
- Reuse Button, Input/Field, EmptyState, ConfirmDialog, semantic tokens and sidebar. Refuse learning persistence in demo mode; do not simulate extraction or AI output.
- Validation: Vitest unit/component/axe; TypeScript; ESLint; token contrast; Next build; Deno moderation; Playwright. Historical audit results are not results for this implementation.

### Missing capabilities at audit

Independent documents/jobs/chunks, source-linked questions, practice generation validation, quiz persistence/server scoring, historical aggregates, mock-test timing and learning UI. No official question dataset or answer keys are bundled.

## Proposed minimum schema / order

1. `documents`: owner, safe filename, immutable owner/document storage path, size, status, bounded error, physical page count, pages missing text, timestamps. Processing lease/status on this row is the job equivalent; no separate queue for this synchronous MVP.
2. `document_chunks`: document/owner composite FK, unique chunk index, physical page, content, generated tsvector and GIN index. Atomic completion persists chunks and status.
3. Private PDF-only `documents` bucket: 10 MiB; owner-prefixed paths; no overwrite. Delete storage first then metadata; keep retryable metadata if cleanup fails.
4. User-scoped FTS RPC; then private-only AI context integration with actual references and no-match/error handling.
5. `questions`: owner, optional source document/page, branch/year/subject/topic, MCQ/MSQ/NAT, marks, text/options, nullable answer/explanation, provenance/review state. Manual source review is the reliable initial extraction flow: do not automatically segment arbitrary PDFs or invent absent keys/options.
6. Practice: bounded inputs; strict generated JSON validation; model/time/provenance; AI-generated label. Syntactic validation is not factual verification.
7. Quizzes: private attempts/items, immutable snapshots, keys inaccessible before submission, atomic/idempotent server scoring. MCQ wrong = -marks/3; MSQ/NAT no negative marking; unanswered = 0; MSQ exact set; NAT explicit numeric acceptance range. No adaptive system/leaderboards.
8. Trends: reviewed source-derived structured questions with known years only. Exclude generated questions; report sample coverage. Insufficient data stays empty; no future guarantees.
9. Integrate working services with existing navigation and validate each small batch. No speculative links.

## Security / limitations

- No new service-role use or RLS bypass. Caller-bound tables/RPCs; composite FK forbids cross-owner sources. Anonymous access denied.
- Independently check extension, MIME, actual bytes/size and PDF signature. No OCR, scripts, remote URLs or arbitrary downloads. Bounded extraction; reject limits rather than silently truncate.
- Report blank/image-only pages as missing text. This cannot prove equations/diagrams were extracted; all source extraction remains unverified.
- Synchronous jobs have hosting time limits. Expiring leases permit retry after interruption; stale completion must fail. No automatic worker/cron claimed.
- Storage and Postgres have no shared transaction. Cleanup errors must remain visible/retryable. UI deletion requires confirmation.
- Own-row writes do not certify authenticity. Owners can edit their own data through PostgREST; never treat it as official evidence.
- Additive migrations require review and disposable-database RLS tests before production. Do not blindly replay historical backfills.

## Validation ledger

Initial combined baseline command had unobserved completion; no pass claimed. Live RLS/storage, actual PDF runtime, mocked unit tests and Playwright must be reported separately.

### Batch 1 — extraction repair (implemented)

- Removed parser-failure placeholder text and invalid `workerSrc = false` assignment. Parser errors now reject; cleanup destroys the loading task.
- Added PDF byte signature check, disabled PDF.js evaluation, capped extraction at 200 physical pages / 500,000 characters, rejected image-only PDFs, and preserved physical page count plus missing-text page numbers.
- Added five mocked PDF regression tests. Before repair: 5 failed. After repair: full Vitest suite **220 passed / 20 files**, exit 0 (baseline: 215 passed / 19 files). These tests do NOT execute real PDF.js.
- TypeScript: exit 0. Targeted frontend/test ESLint: exit 0. Edge files are ignored by the repository ESLint configuration, so that is NOT Edge lint validation.
- Token contrast: **68 pairs passed**, exit 0. Next production build: exit 0. `git diff --check`: exit 0. Existing Vite/jsdom canvas and Next middleware deprecation warnings remain.

### Batch 2 — private ingestion foundation (written, NOT acceptance-validated)

- Added `20260917000000_private_documents.sql`: private documents/chunks, owner RLS, PDF-only private storage, expiring processing token, atomic completion and caller-scoped FTS RPC. **Not applied.**
- Added `document-processor` Edge Function using only the authenticated caller client, bounded extraction, durable error reporting and lease-checked completion.
- Added `src/lib/data/documents.ts`: authenticated upload/list/process/delete/search. No demo data; storage cleanup precedes metadata deletion; incomplete cleanup remains visible.
- No frontend route/navigation was added. Private AI retrieval integration, question organization, quizzes/mock tests and trends remain **unimplemented**. Practice generation is now implemented as a pure contract (see Batch 3) — the provider-calling Edge Function is not.

### Batch 3 — practice question generation contract (implemented, unit-verified)

- Added `src/lib/practice.ts`: bounded request validation, the strict JSON prompt (including the rules that forbid claiming official provenance or inventing citations), a strict parser that reuses `quiz.ts`'s `validateQuestion`, duplicate detection via fingerprint, and a batch cap of 25.
- A reply that yields no usable question is a **failure** (`empty_response` / `malformed_json` / `no_valid_questions`), never an empty success — so a provider error body cannot be rendered as "the model returned no questions".
- `tests/practice.test.ts`: **42 tests**, deterministic fixtures only. No live AI, no network.
- Gates after this batch: `tsc` exit 0 · ESLint **0 errors** (21 pre-existing warnings, unchanged) · `npm test` **298 passed / 24 files** (was 256/23) · `npm run build` exit 0.
- **Not** a live generator: the Edge Function that would call the provider is not written and nothing is deployed. The quiz-taking UI, retrieval into the AI context, and question-paper analysis remain unimplemented.
- No total per-user document quota or durable background queue yet. List is capped at the latest 100 rows; pagination is not implemented. Metadata owner writes are not an authenticity guarantee. Concurrent upload/deletion cleanup needs integration coverage before release.

### Acceptance blockers / next checkpoint

- `deno --version`: unavailable. Docker/Podman: unavailable. `supabase status`: exit 1, not linked, cannot inspect container health. No local Supabase config, environment file or relevant environment variable was found (no secret values printed).
- Attempted `supabase functions test attachment-processor`: exit 1; unsupported CLI subcommand, **not** an executed integration test.
- Actual PDF.js runtime, Edge type-check, two-user RLS/storage isolation, FTS ownership, failed persistence and interrupted/deletion races: **not verified**. No Playwright execution/E2E claim.
- User confirmed there is no original failure and will supply a representative readable PDF. Pending its absolute local path, pause feature expansion and run a real-parser acceptance test first, followed by local Supabase two-user tests after runtime/configuration is available.
- Do not deploy this foundation as a completed MVP. Review the unapplied migration; verify real extraction and RLS/storage before further learning features or any document-grounding claim.

