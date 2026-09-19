# AARAGATE — Continuation Checkpoint

> **Branch:** `main`
> **Last commit:** resolve with `git log --oneline -1` (hash intentionally not pinned here to avoid a self-referential stale-hash loop)
> **Date:** 2026-09-19
> **Remote:** `origin https://github.com/Crusty-chirayu/AARAGATE.git`

## What I did this session (2026-09-19)

### 1. Found and fixed a real, reproducible test-suite defect (not a product bug)

`npm test` — which is exactly what `ci.yml:35` runs — was **non-deterministic**:

| Invocation | Result |
| --- | --- |
| `npx vitest run` (default file parallelism) | **247 passed / 9 failed** (23 files) |
| `npx vitest run tests/keyboard-focus.test.tsx tests/dialog-focus-regression.test.tsx` | **24 passed (24)** |
| `npx vitest run --fileParallelism=false` | **256 passed (256)** |

The 9 failures were in `tests/keyboard-focus.test.tsx` (1) and
`tests/dialog-focus-regression.test.tsx` (8). **Root cause: jsdom's
`requestAnimationFrame` is a ~16ms timer; running the jsdom files in parallel
starves those timers.** The dialog suites defer focus to a rAF via their local
`flushFrame()` helper, so under load the callback never ran:

- `Error: Test timed out in 5000ms` inside `flushFrame()`, and
- `Unable to find a label with the text of: /Topic/`, with the dumped DOM still
  frozen at framer-motion's `initial` state (`opacity: 0;
  transform: translateY(8px) scale(0.95)`).

Both files pass in isolation. Neither file imports the two chat components that
were dirty in the working tree, so this was **pre-existing at HEAD (`dbf8988`),
not caused by the uncommitted streaming work.**

**Fix (`vitest.config.mts`):** `fileParallelism: false`, with the measurement in
a comment. At the same wall-clock cost (25.3s parallel vs 27.6s serial —
negligible), `npm test` is now deterministic. This is a harness setting; **no
test, assertion, or timeout was relaxed.**

### 2. Established the full baseline on the committed tree

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **PASS** (exit 0) |
| Lint | `npm run lint` | **PASS** — 0 errors, 21 warnings (pre-existing `set-state-in-effect` / unused-var) |
| Unit tests | `npm test` | **PASS — 256/256, 23 files** (after the fix above) |
| Token contrast | `node scripts/contrast.mjs` | **PASS — 68 pairs** |
| Playwright | `npx playwright test --workers=1` | **37 passed / 1 flaky** (5.0m) |

**The single Playwright failure is flaky, not a defect:**
`e2e/command-palette.spec.ts:22` — `expect(palette).toBeVisible()` timed out
after `page.keyboard.press("Control+k")`. Re-run in isolation: **5/5 passed
(28.9s)**, including that exact test (5.9s). The same spec's *identical* Ctrl+K
flow at line 10 passed in the same full run, so the cause is a **hydration race
against a cold `next dev` compile** — Ctrl+K is pressed before the client
keyboard handler is live. `gotoDashboard()` waits for `getByRole("main")`, which
proves the SSR DOM rendered, not that React hydrated. CI already tolerates this
(`playwright.config.ts` sets `retries: 2` when `CI` is set); local runs have
`retries: 0`. Left unmodified deliberately — hardening it would touch a spec that
is not wrong.

### 3. §2.7 streaming performance — honest status (budget NOT met at 4×)

`e2e/perf.spec.ts` in the full run:

```
[perf] 4x CPU throttle · blocking tasks >50ms: 27 · median=81.0ms · p95=390.0ms · max=2042.0ms
[perf] PERF_STRICT not set — reporting only, nothing enforced.
```

The spec is **report-only by default**, by design: `PERF_STRICT=1` is what turns
the 250ms ceiling into an assertion, and it is not set at user, machine, or
session level (verified). The spec's own docstring records why: at 4× throttle
every JS task inflates ~4×, so a fixed 250ms ceiling needs a runner with real
single-core headroom. **The threshold was not changed and no assertion was
weakened.** The measured max (2.0s) is above the ceiling, so the honest
statement is: *the streaming render path is materially improved but the enforced
budget is not demonstrated as met on this machine at 4×.*

Uncommitted work carried into this checkpoint (previous session, still
unverified against the strict budget): coalesced stream deltas into one publish
per animation frame, moved the in-flight reply text out of React state into a
`useSyncExternalStore` source so a delta re-renders only the bubble's text node,
added `MessageItem` row-identity reuse (`sameRow`), and memoised the reaction /
read-receipt grouping.

### 4. Repo hygiene

- Removed all scratch artifacts (`_*.log`, `_*.txt`, `_*.json`) and the
  throwaway diagnostic spec `e2e/_diag.spec.ts`. No tracked file was deleted.
- Reviewed the whole diff (362 lines): no `console.log`, `debugger`, `TODO`,
  `FIXME`, `HACK`, and no `sk-`/`eyJ`/`secret`/`password` strings.

### 5. §9/§10 practice question generation — new, unit-verified (MVP priority 4)

`src/lib/quiz.ts` already owned `validateQuestion` and the scoring engine
(priority 5); what was missing was the generation contract (priority 4). Added
`src/lib/practice.ts`, pure and deterministic — no Supabase, no network, no
clock, no randomness:

- **`validatePracticeConfig`** — bounds and normalises the request (branch,
  subject, optional topic, difficulty, per-kind counts, optional source-document
  UUID). Rejects rather than clamping, so "50 questions" can never silently
  become 25.
- **`buildPracticePrompt`** — the strict JSON contract, with the provenance
  rules inside it: the model is told outright that these are AI-generated
  practice questions, must not claim official provenance, and must not invent
  citations.
- **`parsePracticeQuestions`** — extracts the first balanced JSON value
  (tolerating a code fence or preamble as *transport* tolerance only), then
  validates every entry through the **existing** `validateQuestion` from
  `quiz.ts`. Per-entry failures are reported in `rejected` with their index
  rather than discarding the batch; duplicates are counted via
  `questionFingerprint`; the batch is capped at `MAX_PRACTICE_QUESTIONS`. A reply
  yielding **no** usable question is a failure (`empty_response` /
  `malformed_json` / `no_valid_questions`), never an empty success — so a
  provider error body can never be rendered as "the model returned no questions".
- **`practiceProvenance`** — `source: "ai_generated"` plus the label, with
  `source_document_id` set only when a document really was supplied.

`tests/practice.test.ts` — **42 tests**, deterministic fixtures only, no live AI:
config bounds, prompt provenance rules, well-formed MCQ/MSQ/NAT parsing, code
fences, missing answers, invalid and duplicate option ids, an MCQ carrying two
answers, a NAT carrying options or an inverted range, non-object entries,
duplicates, the cap, fingerprints, and provenance labelling.

**Verified:** `npx tsc --noEmit` **exit 0** — which caught a real narrowing gap
(`Array.includes(x as T)` does not narrow `unknown`, now an
`isPracticeDifficulty` type guard mirroring `quiz.ts`'s `isQuestionKind`);
`npx eslint` **0 errors**, no new warnings; `npm test` **298/298, 24 files**
(was 256/23); `npm run build` **exit 0**.

**Scope, stated plainly:** this is the generation *contract*, not a live
generator. The provider call belongs in an Edge Function, which was **not
written and not deployed** — that needs explicit owner approval. Still
unimplemented: the quiz-taking UI, retrieval into the AI context, and
question-paper analysis.

## Exact current blocker

**None for the baseline.** Two items are genuinely blocked or unverified:

1. **§2.7 strict perf budget** — unverifiable on this machine at 4× throttle
   (see above). Not a code blocker; a measurement-environment one.
2. **Supabase-dependent features** (`src/lib/data/documents.ts` ingestion,
   `search_documents` retrieval, RLS/Storage policies) cannot be acceptance-
   tested locally: there is no `.env.local`, no linked Supabase project, and no
   Docker/Podman. Their logic is unit-tested with mocks; **real RLS, Storage and
   two-user isolation remain unverified and must not be claimed as working.**

## Continuation instructions for next session

1. `npx tsc --noEmit`, `npm run lint`, `npm test` (should be 256/256 and now
   deterministic), `npx playwright test --workers=1`.
2. Next priority is **§9/§10 question generation** (priority 4 in the MVP
   order): `src/lib/quiz.ts` already owns `validateQuestion` + the scoring
   engine; the generation/parse pipeline is what is missing.
3. Do not re-litigate the flaky comment-palette test; it is understood and
   CI-retry-covered.

---

## Previous session (2026-09-18)

### What I did that session

### Root cause found and fixed — room-deletion E2E test

The room-deletion test was failing with the browser stuck on `/app/c/<id>`. Earlier
attempts blamed `router.push` being swallowed during modal teardown and added a
`setTimeout(onLeft, 0)` workaround. **That diagnosis was wrong.**

A diagnostic spec (`e2e/diag-delete.spec.ts`, since deleted) monkey-patched
`history.pushState` / `replaceState` before the confirm click and reported:

```
[test] about to click delete confirm
[test] clicked delete confirm
[test] nav attempts: []
[test] current URL: http://127.0.0.1:3000/app/c/02524407-...
[test] confirm dialog still visible: true
```

`router.push` was **never called**, and the confirm dialog **never closed**. The
cause is in `ConfirmDialog.handle()` (`src/components/ui/modal.tsx`):

```ts
if (Date.now() - openedAt.current < 450) {
  setShake(true);
  setTimeout(() => setShake(false), 420);
  return;   // silently returns — onConfirm() never runs
}
```

A 450 ms anti-double-click debounce. Playwright clicked the confirm button
within 450 ms of the dialog opening, so the handler silently no-op'd with a
visual shake. Re-running the diagnostic with a 600 ms wait before the click
proved it:

```
[page console] log: [HISTORY pushState] /app
[test] nav attempts: ["pushState: /app from /app/c/79a3ab74-..."]
[test] current URL: http://127.0.0.1:3000/app
[test] confirm dialog still visible: false
```

**Fix:** the test now waits past the debounce window before clicking confirm —
which is also what a real user does (read a destructive confirm before acting).

### Source changes (committed in `070362b`)

- **`src/components/chat/chat-view.tsx`** — coalesce demo stream deltas into one
  state update per animation frame (`streamBuf` ref + `requestAnimationFrame(flushStream)`).
  This is the actual §2.7 streaming perf fix.
- **`src/components/chat/message-item.tsx`** — 27 call sites changed from bare
  closures (`onReact(e)`, `onRegenerate`, `onDelete`) to id-passing forms
  (`onReact(message.id, e)`, `onRegenerate(message.id)`, `onDelete(message.id)`).
  Removes the closure over an outer `message` variable.
- **`src/components/chat/room-settings-modal.tsx`** — (a) `aria-pressed` on the
  AI-mode segmented-control buttons; (b) **reverted** the incorrect
  `setTimeout(onLeft, 0)` workaround back to a direct `onLeft()` call.
- **`src/components/layout/new-conversation-modal.tsx`** — `aria-pressed` on the
  kind and AI-mode segmented-control buttons.

### Spec changes (committed in `070362b`)

- **`e2e/interaction-regression.spec.ts`** — restructured into 5 focused tests;
  the deletion test now waits past the 450 ms confirm debounce. **Passes**
  (1 passed, 20.0s on the single-test run).
- **`e2e/perf.spec.ts`** — har probe switched from a frame-interval
  (`requestAnimationFrame` delta) measurement to a long-task
  (`PerformanceObserver({ type: "longtask" })`) measurement, plus a `PERF_THROTTLE`
  env knob for unthrottled local baselines. **Validity unresolved** — see below.
- **`e2e/command-palette.spec.ts`** — 2-line pass.

### Cleanup

- Deleted scratch artifacts: `e2e/__probe.spec.ts`, `e2e/diag-delete.spec.ts`,
  `pw-*.log`, `build-prod*.log`, `prod-server*.log`, and the `_*.py` helper scripts.
- Stopped dev/prod servers and headless Chromium.

## Uncommitted changes at this checkpoint

**None.** All tracked work is committed. Scratch artifacts (`pw-*.log`, `_*.py`,
`e2e/diag-delete.spec.ts`, `e2e/__probe.spec.ts`, `ext-server`) were removed or
left untracked and are not part of any commit.

## What remains unfinished

1. **Perf spec har-probe validity — UNRESOLVED.** The rewrite moved from a
   frame-interval (rAF delta) har probe to a long-task
   (`PerformanceObserver({ type: "longtask" })`) har probe. Whether the
   long-task approach actually detects the coalescing benefit is unconfirmed:
   if individual deltas stay under 50 ms even at 4× throttle, the observer
   reports nothing and the har probe cannot distinguish coalesced from
   uncoalesced streaming. The original frame-interval approach had the opposite
   concern (whether headless Chrome's rAF cadence under 4× throttle reflects
   smoothness or just the display refresh rate). Neither har probe has been
   validated against a known-smooth / known-janky baseline in this environment.
2. **The full suite has not been re-run in its current form.** Only
   `e2e/interaction-regression.spec.ts` was re-run (passes). `perf.spec.ts`,
   `command-palette.spec.ts`, `fonts.spec.ts`, `group-room.spec.ts` and the rest
   have not been re-run against the current working tree.

## Exact current blocker

**None.** The room-deletion failure is resolved and its root cause is understood
(450 ms `ConfirmDialog` debounce vs. a sub-450 ms Playwright click). The only
open item is the perf har-probe validation described above, which is a
measurement-methodology question, not a product bug.

## Does the animation issue require a fix?

**No** — not addressed by this session's work, and not necessarily a bug. The
`Modal.tsx` edits (flex column structure + `overflow-y-auto` body + sticky
footer) are structural and fix the "button pushed off-screen on tall dialogs"
problem. The save-time shift/shrink is a different phenomenon (React
re-measurement during the save re-render); whether it needs a fix was not
investigated. The reduced-motion warning in the logs is expected (the test
browser has reduced motion enabled).

## TypeScript + Playwright status

| Gate | Status |
| --- | --- |
| TypeScript (`npx tsc --noEmit`) | **PASS** (exit 0), re-verified |
| Playwright — `interaction-regression.spec.ts` | **PASS** (1 passed, 20.0s) |
| Playwright — full suite | **NOT RE-RUN** in current form |
| Vitest | Not re-run this session; prior: 226 passed / 22 files |
| Contrast / ESLint | Not re-run this session; prior: PASS / 0 errors + 17 pre-existing warnings |

## Secrets / env

No `.env.local` created. The app runs in **DEMO MODE** for local dev and E2E
(Playwright forces blank Supabase env vars for the webServer). No secrets committed.

## Continuation instructions for next session

1. **Re-run `npx tsc --noEmit`** to confirm the tree still compiles.
2. **Validate the perf har probe** — run `perf.spec.ts` against a
   known-coalesced vs. known-uncoalesced baseline (temporarily disable the rAF
   coalescing in `chat-view.tsx` and confirm the har probe's output changes). If
   the long-task observer reports nothing either way, revert to the
   frame-interval approach or pick a third har probe.
3. **Run the full suite** before treating this branch as green.
4. **Decide on the animation issue** — confirm whether the save-time modal
   shift/shrink is expected or a defect.

---

## Git checkpoint

- **Branch:** `main`
- **Checkpoint commits (local, ahead of `origin/main`), oldest → newest:**
  - `070362b` — "WIP checkpoint: interaction-regression + perf spec rewrites, streaming perf fix, a11y + callback cleanup"
  - `9c6b7a1` — "checkpoint: fix room-deletion test (ConfirmDialog debounce), revert setTimeout workaround, refresh status docs"
  - `008e089` — "docs: finalize checkpoint hashes and trim stale fragments"
  - a final `docs:` commit containing this file's last edit (its own hash is intentionally not written here, to avoid a self-referential stale-hash loop — resolve it with `git log --oneline -1`)
- **No `.env.local` created.**
- **Not pushed.** (Per instruction: stop after the checkpoint commit.)
