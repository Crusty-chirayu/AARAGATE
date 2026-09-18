# AARAGATE — Continuation Checkpoint

> **Branch:** `main`
> **Last remote commit:** `822fc6d` (Merge origin/main into main)
> **Date:** 2026-09-18
> **Remote:** `origin https://github.com/Crusty-chirayu/AARAGATE.git`

## What I did this session

### Spec files (new / rewritten)
- **`e2e/interaction-regression.spec.ts`** — rewrote from a single 5-scope test into 5 focused tests (typing, first-click selection, rename+pin, group-room creation, current-room deletion). Standardized fixtures across them. **Does not yet pass** — the deletion test fails.
- **`e2e/perf.spec.ts`** — rewrote the §2.7 har probe from a frame-interval (`requestAnimationFrame` delta) measurement to a long-task (`PerformanceObserver({ type: "longtask" })`) measurement, plus a `PERF_THROTTLE` env knob for unthrottled local baselines. **Under verification** — whether the long-task har probe detects the coalescing benefit is unresolved (see blocker).
- **`e2e/command-palette.spec.ts`** — 2-line editing pass.

### Source files
- **`src/components/chat/chat-view.tsx`** — coalesce demo stream deltas into one state update per animation frame (`streamBuf` ref + `requestAnimationFrame(flushStream)`). This is the actual §2.7 streaming perf fix.
- **`src/components/chat/message-item.tsx`** — 27 call sites changed from bare closures (`onReact(e)`, `onRegenerate`, `onDelete`) to `id`-passing forms (`onReact(message.id, e)`, `onRegenerate(message.id)`, `onDelete(message.id)`). Parent now passes `id`; callbacks no longer capture via closure over an outer `message` variable.
- **`src/components/chat/room-settings-modal.tsx`** — two edits: (a) `aria-pressed={aiMode === m.v}` on the AI-mode segmented-control buttons; (b) the delete `onConfirm` now does `setTimeout(onLeft, 0)` after `onClose()` instead of calling `onLeft()` directly. **(b) does not fix the deletion test — same failure.**
- **`src/components/layout/new-conversation-modal.tsx`** — `aria-pressed={kind === o.v}` and `aria-pressed={aiMode === m.v}` on the segmented-control buttons.

### Cleanup
- Deleted scratch artifacts from prior sessions: `e2e/__probe.spec.ts`, all `pw-*.log`, `build-prod*.log`, `prod-server*.log`.
- Stopped dev/prod servers and headless Chromium.

## Uncommitted changes (full file list)

```
M e2e/command-palette.spec.ts
M e2e/interaction-regression.spec.ts
M e2e/perf.spec.ts
M src/components/chat/chat-view.tsx
M src/components/chat/message-item.tsx
M src/components/chat/room-settings-modal.tsx
M src/components/layout/new-conversation-modal.tsx
```

The remaining `??` entries (pw-*.log, pw-fix*.log, pw-full*.log, pw-perf*.log, pw-del*.log, ext-server) are scratch/diagnostic artifacts and are **not** part of the checkpoint commit.


## What remains unfinished

1. **Room-deletion test (`interaction-regression.spec.ts` last test) — FAILS.** After "Delete permanently" → confirm dialog → click confirm → `onClose()` (unmounts confirm dialog) → `onLeft()` (=`router.push("/app")`) is scheduled at `setTimeout 0`. The browser stays on `/app/c/<id>`. The 8s URL expectation times out. Changed `onLeft()` (direct) → `setTimeout(onLeft, 0)`; same result — so the issue is **not** that `onLeft` fires during teardown.
2. **Perf spec har-probe validity — UNRESOLVED.** The rewrite moved from a frame-interval (rAF delta) har probe to a long-task (`PerformanceObserver({ type: "longtask" })`) har probe. Whether the long-task approach actually detects the coalescing benefit is unconfirmed: if individual deltas stay under 50ms even at 4× throttle, the observer reports nothing and the har probe can't distinguish coalesced vs. uncoalesced streaming. The original frame-interval approach had the opposite concern (whether headless Chrome's rAF cadence under 4× throttle reflects smoothness or just the display refresh rate). Neither har probe has been validated against a known-smooth / known-janky baseline in this environment.
3. **The full original suite has not been re-run against this branch in its current form.** I rewrote two spec files from scratch; their relationship to the original suite's intent is assumed, not confirmed.

## Exact current blocker

The deletion test's `router.push("/app")` is being swallowed. I do **not** yet know why. What I've ruled out:

- **Stale closure:** `onLeft` is `() => router.push("/app")` from `useRouter()` at `chat-view.tsx:43` — stable, wired at `chat-view.tsx:599`, passed through `room-settings-modal.tsx` to the delete `onConfirm` at `:478-486`.
- **`onClose` race:** `onClose` (the modal's unmount, `() => setSettingsOpen(false)`) is awaited before `onLeft` in the direct version; the `setTimeout 0` version also doesn't help.
- **Auth guard:** the test is signed in; `AppLayout`'s `!profile` guard does not fire.
- **`deleteConversation` side effects:** demo-mode delete only filters `demo.db()` and calls `demo.commit()` (writes localStorage + fires listeners = AppLayout refresh + ChatView `load()`). Neither navigates.
- **Teardown timing:** the `setTimeout 0` deferral did not change the outcome, so this is not a macrotask-timing issue.

What I **haven't** captured: whether `router.push("/app")` is even being called (need a `page.evaluate` spy or `page.on("request")`/`response` listener), whether Next.js's client router is rerouting back to `/app/c/<id>` for some reason, or whether some other effect is resetting the URL. I stopped at spec + source edits and did not instrument.

## Does the animation issue require a fix?

**No** — it is not addressed by this session's work, and it is not necessarily a bug. The Modal.tsx edits (flex column structure + `overflow-y-auto` body + sticky footer) are structural and fix the "button pushed off-screen on tall dialogs" problem. The save-time shift/shrink is a different phenomenon (React re-measurement during the save re-render); whether it needs a fix was not investigated.

## TypeScript + Playwright status at checkpoint

| Gate | Status |
| --- | --- |
| TypeScript (`npx tsc --noEmit`) | **PASS** (exit 0) — re-verified before stopping. |
| Playwright (full suite) | **NOT RE-RUN** in current form. The suite as it stood before this session was already failing. This session rewrote `interaction-regression.spec.ts` and `perf.spec.ts`; the deletion test within the former fails. No full-suite run has been completed against the current working tree. |
| Vitest | Not re-run this session. Prior checkpoint: 226 passed / 22 files. |
| Contrast / ESLint | Not re-run this session. Prior checkpoint: PASS / 0 errors + 17 pre-existing warnings. |

## Commands executed before stopping

```text
git status --porcelain
git diff --stat HEAD
git diff -- src/components/chat/chat-view.tsx src/components/chat/message-item.tsx src/components/chat/room-settings-modal.tsx src/components/layout/new-conversation-modal.tsx e2e/command-palette.spec.ts e2e/interaction-regression.spec.ts e2e/perf.spec.ts
npx tsc --noEmit   (PASS, exit 0)
```

## Secrets / env

No `.env.local` created. The app runs in **DEMO MODE** for local dev and E2E (Playwright forces blank Supabase env vars for the webServer). No secrets committed.

## Continuation instructions for next session

1. **Re-run `npx tsc --noEmit`** to confirm the tree still compiles.
2. **Instrument the deletion test** — add a `page.evaluate` spy on the `onLeft` callback, or listen for `page.on("response")` / `page.route(` to confirm whether `router.push("/app")` fires and whether Next.js processes it. Don't guess at timing again.
3. **Validate the perf har probe** — run the `perf.spec.ts` against a known-coalesced vs. known-uncoalesced baseline (temporarily disable the rAF coalescing in `chat-view.tsx` and confirm the har probe's output changes). If the long-task observer reports nothing either way, revert to the frame-interval approach or pick a third har probe.
4. **Decide on the animation issue** — confirm whether the save-time modal shift/shrink is expected or a defect.
5. **Run the full suite** (including any original specs that still exist alongside the two I rewrote) before treating this branch as green.

---

## Git checkpoint

- **Branch:** `main`
- **Checkpoint commit:** created at this checkpoint (`git log --oneline -1`).
- **Uncommitted changes after checkpoint commit:** none expected — the checkpoint commit covers all tracked working-tree changes; scratch `??` artifacts are gitignored or left untracked.
- **No `.env.local` created.**
- **Not pushed.** (Per instruction: stop after the checkpoint commit.)
