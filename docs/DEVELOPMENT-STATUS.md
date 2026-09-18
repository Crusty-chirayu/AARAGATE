# AARAGATE — Development Status

> **Last updated:** 2026-09-18
> **Branch:** `main`

> This file is a human-readable roll-up of the current development state. The authoritative per-session record lives in `docs/CONTINUATION-CHECKPOINT.md`.

## Scope of work in this branch

Two intersecting threads:

1. **UI/UX redesign pass** — design-token → Tailwind CSS layer, modal shell structure, accessible segmented controls (aria-pressed), chat UI refinements, streaming perf fix.
2. **E2E suite hardening** — rewritten `interaction-regression.spec.ts` (5 focused tests), rewritten `perf.spec.ts` (long-task har probe + `PERF_THROTTLE` knob), 2-line pass on `command-palette.spec.ts`.

## What landed cleanly (and why it matters)

- **Streaming perf fix** (`chat-view.tsx`): coalesce demo stream deltas into one state update per animation frame. This is the actual §2.7 fix; the perf spec har probe is the probe for it — but the har probe itself is unvalidated (see below).
- **Accessible segmented controls**: `aria-pressed` added on AI-mode buttons in `room-settings-modal.tsx` and on kind/ai-mode buttons in `new-conversation-modal.tsx`.
- **Callback cleanup** (`message-item.tsx`): 27 call sites switched from capturing via closure over an outer `message` variable to passing `message.id` explicitly. Reduces closure churn per render; does not change behavior.
- **Specs**: `interaction-regression.spec.ts` restructured into 5 tests from 1 monolithic test; `perf.spec.ts` switched har probe type and added unthrottled baseline knob.

## What is blocked / unverified

| Item | State | Why |
| --- | --- | --- |
| Room-deletion E2E test | **FAILS** | `router.push('/app')` is swallowed after confirm dialog close; `setTimeout 0` did not fix it. Root cause not yet instrumented. |
| Perf spec har probe | **UNRESOLVED** | Whether the long-task (`PerformanceObserver('longtask')`) har probe detects the coalescing benefit is unconfirmed; neither this har probe nor the prior frame-interval har probe has been validated against a known-smooth / known-janky baseline. |
| Full suite run | **NOT DONE** | Two spec files rewritten; full suite not re-run against current working tree. |
| Animation issue (modal shift on save) | **NOT INVESTIGATED** | Different phenomenon from the Modal.tsx structural fix; whether it needs a fix not assessed. |

## Local quality gates

| Gate | Result |
| --- | --- |
| TypeScript (`npx tsc --noEmit`) | **PASS** (exit 0) at checkpoint |
| Playwright | **NOT RE-RUN** in current form; prior checkpoint already failing |
| Vitest | Not re-run this session; prior checkpoint 226 passed / 22 files |
| Contrast | Not re-run this session; prior checkpoint PASS |
| ESLint | Not re-run this session; prior checkpoint 0 errors + 17 pre-existing warnings |

## Environment

- **DEMO MODE**: no `.env.local`; Supabase env vars blank for local dev and E2E.
- **No servers running** at checkpoint (dev, prod, headless Chromium all stopped).
- **No secrets committed**.

## Next session — first actions

1. `npx tsc --noEmit` to confirm tree still compiles.
2. Instrument the deletion test (spy `onLeft`, or `page.route` / `page.on('response')`) to confirm whether `router.push('/app')` fires and whether Next.js processes it.
3. Validate the perf har probe against a coalesced vs. uncoalesced baseline.
4. Decide on the animation issue.
5. Run the full suite before treating the branch as green.

## Checkpoint commit

- Commit message: `WIP checkpoint: interaction-regression + perf spec rewrites, streaming perf fix, a11y + callback cleanup`
- **Not pushed.** (Per instruction: stop after the checkpoint commit.)

---

*This file is informational. For the exact per-session record and uncommitted-change list, read `docs/CONTINUATION-CHECKPOINT.md`.*
