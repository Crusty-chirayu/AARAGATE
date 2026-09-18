# AARAGATE — Continuation Checkpoint

> **Branch:** `main`
> **Last commit:** `9c6b7a1` (checkpoint: fix room-deletion test)
> **Date:** 2026-09-18
> **Remote:** `origin https://github.com/Crusty-chirayu/AARAGATE.git`

## What I did this session

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
- **Checkpoint commit:** `9c6b7a1` — "checkpoint: fix room-deletion test (ConfirmDialog debounce), revert setTimeout workaround, refresh status docs".
- **Preceding commit:** `070362b` — "WIP checkpoint: interaction-regression + perf spec rewrites, streaming perf fix, a11y + callback cleanup".
- **No `.env.local` created.**
- **Not pushed.** (Per instruction: stop after the checkpoint commit.)
