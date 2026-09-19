# AARAGATE — Development Status

> **Last updated:** 2026-09-19
> **Branch:** `main`
> **Latest commit:** resolve with `git log --oneline -1` (hash intentionally not pinned here to avoid a self-referential stale-hash loop)

> This file is a human-readable roll-up of the current development state. The
> authoritative per-session record lives in `docs/CONTINUATION-CHECKPOINT.md`.

## Scope of work in this branch

Two intersecting threads:

1. **UI/UX redesign pass** — design-token → Tailwind CSS layer, modal shell
   structure, accessible segmented controls (`aria-pressed`), chat UI refinements,
   streaming perf fix.
2. **E2E suite hardening** — rewritten `interaction-regression.spec.ts` (5 focused
   tests, deletion test now passes), rewritten `perf.spec.ts` (long-task har probe
   + `PERF_THROTTLE` knob), 2-line pass on `command-palette.spec.ts`.

## What landed cleanly (and why it matters)

- **Streaming perf fix** (`chat-view.tsx`): coalesce demo stream deltas into one
  state update per animation frame. This is the actual §2.7 fix.
- **Accessible segmented controls**: `aria-pressed` added on AI-mode buttons in
  `room-settings-modal.tsx` and on kind/ai-mode buttons in
  `new-conversation-modal.tsx`.
- **Callback cleanup** (`message-item.tsx`): 27 call sites switched from capturing
  via closure over an outer `message` variable to passing `message.id` explicitly.
  Reduces closure churn per render; does not change behavior.
- **Room-deletion E2E test fixed.** Root cause: `ConfirmDialog.handle()` in
  `src/components/ui/modal.tsx` has a 450 ms anti-double-click debounce that
  silently returns (visual shake only) when the confirm button is clicked too
  soon after the dialog opens. Playwright clicked inside that window, so
  `onConfirm()` — and therefore `router.push("/app")` — never ran. The test now
  waits past the debounce. The earlier `setTimeout(onLeft, 0)` "fix" in
  `room-settings-modal.tsx` was based on a wrong diagnosis and has been reverted.
- **Specs**: `interaction-regression.spec.ts` restructured into 5 tests from 1
  monolithic test; `perf.spec.ts` switched har probe type and added an unthrottled
  baseline knob.

## What is blocked / unverified

| Item | State | Why |
| --- | --- | --- |
| Perf spec har probe | **UNRESOLVED** | Whether the long-task (`PerformanceObserver("longtask")`) har probe detects the coalescing benefit is unconfirmed; neither this har probe nor the prior frame-interval har probe has been validated against a known-smooth / known-janky baseline. |
| Full suite run | **NOT DONE** | Only `interaction-regression.spec.ts` was re-run (passes); the rest of the suite has not been re-run against the current working tree. |
| Animation issue (modal shift on save) | **NOT INVESTIGATED** | Different phenomenon from the `Modal.tsx` structural fix; whether it needs a fix not assessed. |
| Room-deletion E2E test | **RESOLVED** | 450 ms `ConfirmDialog` debounce vs. sub-450 ms Playwright click; test now waits past it. |

## Local quality gates (2026-09-19 — full baseline, all on the committed tree)

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **PASS** (exit 0) |
| Lint | `npm run lint` | **PASS** — 0 errors, 21 warnings (pre-existing) |
| Unit tests | `npm test` | **PASS — 306/306, 25 files** |
| Token contrast | `node scripts/contrast.mjs` | **PASS — 68 pairs** |
| Playwright | `npx playwright test --workers=1` | **37 passed / 1 flaky** (5.0m) |
| Perf (§2.7) | `npx playwright test e2e/perf.spec.ts --workers=1` | **REPORT-ONLY** — median 81ms / p95 390ms / max 2042ms at 4×; budget **not** demonstrated as met |

### Resolved this session

| Item | Resolution |
| --- | --- |
| `npm test` non-determinism (9 failures) | **RESOLVED.** jsdom `requestAnimationFrame` timer starvation under file parallelism starved the dialog suites' `flushFrame()`. Fixed with `fileParallelism: false` in `vitest.config.mts` (measured 247/256 → 256/256 at the same wall-clock cost). No test or assertion relaxed. |
| Playwright `command-palette.spec.ts:22` | **CLASSIFIED FLAKY, not a defect.** Fails only in the full run; 5/5 in isolation. Hydration race: Ctrl+K pressed before React hydrated against a cold `next dev` compile. Covered by CI's `retries: 2`. |
| `_diag.spec.ts` + scratch logs | **REMOVED.** No tracked file deleted. |

### Implemented this session

| Item | State |
| --- | --- |
| §9/§10 practice question generation contract (`src/lib/practice.ts`) | **IMPLEMENTED AND UNIT-VERIFIED — 42 fixture tests, no live AI.** Bounded request config, strict JSON prompt with provenance rules, strict parse reusing `quiz.ts`'s `validateQuestion`, duplicate detection, batch cap, and an explicit `empty_response` / `malformed_json` / `no_valid_questions` failure union. **Not** a live generator: the Edge Function that calls the provider is not written. |
| Security — cross-conversation message write (`ai-orchestrator` `supersedes_id`) | **FIXED IN CODE — HIGH finding closed.** Was: an unconstrained service_role update on a caller-supplied UUID, letting any authenticated user hide an arbitrary message in any room. Now: target loaded scoped to the caller's verified conversation, rules enforced by `_shared/supersede.ts`, stable 403 codes, scoped write. **8 unit tests.** Not runtime-verified (no live Edge execution). |
| Security — Storage path not bound to its parent (`attachment-processor`) | **FIXED IN CODE — HIGH finding closed.** Was: service_role download of a member-editable `storage_path` that the Storage policy scopes only to the first path segment. Now: path must match `{conversation_id}/{message_id}/` and the download uses the caller's client so RLS applies. Verified by inspection + `tsc`; **not runtime-verified**. The SQL-side policy tightening remains open. |
| Quiz-taking UI, retrieval into AI context, question-paper analysis | **NOT IMPLEMENTED.** |

## Environment

- **DEMO MODE**: no `.env.local`; Supabase env vars blank for local dev and E2E.
- **No servers running** at checkpoint (dev, prod, headless Chromium all stopped).
- **No secrets committed**.

## Next session — first actions

1. `npx tsc --noEmit` to confirm the tree still compiles.
2. Validate the perf har probe against a coalesced vs. uncoalesced baseline.
3. Run the full suite before treating the branch as green.
4. Decide on the animation issue (modal shift/shrink on save).

## Checkpoint commit

- Commit message: `checkpoint: fix room-deletion test (ConfirmDialog debounce), revert setTimeout workaround, refresh status docs`
- **Not pushed.** (Per instruction: stop after the checkpoint commit.)

---

*This file is informational. For the exact per-session record, read `docs/CONTINUATION-CHECKPOINT.md`.*
