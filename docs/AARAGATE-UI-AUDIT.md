# AARAGATE — UI/UX, branding & visual identity audit

**Status:** pre-implementation audit + batch plan.

**Baseline measured on the committed tree (`main` @ `2836696`) before any change:**

| Gate | Command | Result |
| --- | --- | --- |
| Type-check | `npx tsc --noEmit` | ✅ exit 0 |
| Lint | `npx eslint .` | ✅ 0 errors, 39 pre-existing warnings |
| Unit / component / a11y tests | `npx vitest run` | ✅ 19 files, **215 tests** |
| Token contrast (WCAG AA) | `node scripts/contrast.mjs` | ✅ **54/54 pairs**, light + dark |
| Token contrast after Batch A/B | `node scripts/contrast.mjs` | ✅ **72/72 pairs** (18 new pairs added) |
| Playwright / browser axe | `npx playwright test` | ⛔ **not run** — no Chromium obtainable in this environment (see `AUDIT.md` → *Errors*) |

Everything else stated below is read from the tree, not assumed.

---

## 1. Existing UI structure

Next.js 16 App Router, React 19, Tailwind v4 (CSS-first `@theme inline`), one client-heavy
app shell, server components only on `pricing` and `changelog`.

```
src/app/
  layout.tsx                 root: fonts, theme script, providers (Theme, Network, Toast, Session)
  page.tsx                   marketing landing (client, framer-motion scroll reveals)
  favicon.ico                stock Next.js icon — not branded
  globals.css                942 lines: primitives → §6 semantic tokens → @theme → utilities
  login/ signup/             auth screens (Supabase + demo-mode branches)
  forgot-password/ reset-password/
  onboarding/                3-step wizard: profile → theme → first conversation
  join/[code]/               invite redemption route
  pricing/  changelog/       marketing + release notes (LandingNav + Logo)
  app/                       signed-in shell (sidebar + mobile drawer + ⌘K palette)
    layout.tsx               client shell: auth guard, realtime feed, modals, drawer
    page.tsx                 "app home": greeting, start-chat cards, prompt shortcuts
    c/[id]/page.tsx          AI chat / group conversation surface
    settings/page.tsx        profile, appearance, privacy + export, danger zone
```

**Information architecture today** is group-chat IA: `Dashboard → (chat | group room)`,
with group-specific affordances layered through the sidebar, the create modal, the join
modal and the command palette. There is **no** Documents, Question papers, Practice,
Quiz or Trends route, and no page-level `loading.tsx` / `error.tsx` anywhere.

## 2. Existing shared components

| Area | Files | Notes |
| --- | --- | --- |
| Brand mark | `components/logo.tsx` | single 32×32 SVG, "two converging streams". Its `<defs>` ids (`cf-g`, `cf-sheen`, `cf-edge`) are **not unique per instance**, so N logos emit N duplicate ids |
| Primitives | `ui/button.tsx`, `ui/input.tsx` (+`Field`), `ui/modal.tsx` (+`ConfirmDialog`), `ui/avatar.tsx` (+`AiAvatar`, `AiPill`), `ui/skeleton.tsx`, `ui/toast.tsx` | genuinely reusable, accessible, motion-token driven |
| Layout | `layout/sidebar.tsx`, `layout/command-palette.tsx`, `layout/search-modal.tsx`, `layout/new-conversation-modal.tsx`, `layout/join-modal.tsx` | the sidebar mixes brand header + create actions + conversation groups |
| Chat | `chat/chat-view.tsx`, `chat/message-item.tsx`, `chat/composer.tsx`, `chat/markdown.tsx`, `chat/citation-list.tsx`, `chat/attachment-chip.tsx`, `chat/room-settings-modal.tsx`, `chat/stream-announcer.tsx` | attachments + **verified server-side citations** already implemented |
| Marketing | `landing/nav.tsx`, `landing/section.tsx`, `landing/hero-demo.tsx` | reusable reveals/headings |
| Providers | `theme-provider.tsx` (`ThemeToggle`, `ThemeSegmented`), `session-provider.tsx`, `network-provider.tsx`, `ui/toast.tsx`, `motion-provider.tsx`, `offline-banner.tsx` | |

Missing primitives the redesign needs: **Card, Badge, Alert, EmptyState, Tabs, skeleton
variants for lists/grids, stat tile**.

## 3. Existing design system

A real, documented system — keep it, extend it, do not replace it.

- **Tokens** (`globals.css`): primitives → §6 semantic tokens (`--bg-app`, `--bg-surface`,
  `--bg-surface-raised`, `--bg-subtle`, `--border-default/strong`, …) with legacy aliases
  (`--fg`, `--accent`, `--ai-accent`) so no mass rename was ever needed. Radius
  `--r-sm…--r-pill`, elevation `--e1…--e4`, motion `--d-micro…--d-hero` +
  `--ease-enter/exit/fluid`, a global `:focus-visible` ring and an additive glass/ambient
  layer.
- **Contrast contract**: `scripts/contrast.mjs` resolves the tokens out of `globals.css`
  and fails on any AA violation — 54 pairs today, both themes.
- **Motion contract**: every timing/easing lives in `src/lib/motion.ts`; components import
  `tEnter`/`tExit`/`SPRING`/variants instead of inventing values.
  `prefers-reduced-motion` is handled globally in CSS (animations collapse to an instant
  cut) **and** framer-motion is wrapped by `motion-provider.tsx`.
- **Type**: Inter + JetBrains Mono, self-hosted via `next/font/local`; no third-party CDN.
- **Density**: 13–15px body scale, 6px control radius, 12px cards.
- **Accessibility**: axe (jsdom) over the key surfaces, a keyboard/focus suite, and a
  Playwright browser-axe spec. Both vitest suites are merge-blocking.

## 4. Confluence-specific UI to remove

| Item | Location | Batch |
| --- | --- | --- |
| Product name "Confluence" | `app/layout.tsx` (title + OG), `logo.tsx`, `sidebar.tsx`, `app/app/layout.tsx`, `landing/nav.tsx`, `auth-shell.tsx`, `pricing/page.tsx`, `changelog/page.tsx`, `app/page.tsx` footer, `globals.css` comments, `README.md`, `SECURITY.md`, `RELEASING.md`, `lib/data-export.ts` (filename), `.env.example` | A/B — replaced |
| Logo concept ("two converging streams") | `components/logo.tsx` | A — replaced by the AARAGATE gate mark |
| Group-chat section navigation | `sidebar.tsx` (`Rooms` group), `lib/utils.ts` (`"Untitled room"`), command palette (`"Create a room"`) | B — renamed to study-group language |
| Room invitations ("Join a room") | `join-modal.tsx`, `join/[code]/page.tsx`, sidebar join action | B — renamed; the feature stays (it is implemented, RLS-protected and tested) |
| `@ai` mention posture copy | `new-conversation-modal.tsx` (`"Responds when someone writes @ai"`), `AiModeBadge` (`"@ai only"`), `chat/composer.tsx` mention popup | C — needs the composer/room-settings pass |
| Group-room marketing copy | `app/page.tsx` features + steps, `pricing/page.tsx`, `lib/pricing.ts`, `changelog/page.tsx` fallback notes | C (landing) / B (wordmark) |
| Test fixtures naming | `tests/data-export.test.ts`, `tests/dialog-focus-regression.test.tsx`, `e2e/*.spec.ts` | updated in the same pass, wherever a string moved |

**Keep:** the whole data layer, auth, RLS, Edge Functions, moderation, rate limits,
attachments + extraction + embeddings + verified citations, read receipts, pinned
conversations, the K palette, the theme system, the motion library, and the
contrast/axe gates.

## 5. Reusable UI to preserve

`Button` (incl. `asChild`/`href` — a single interactive element), `Field`/`Input`/
`Textarea`, `Modal` + `ConfirmDialog` (focus trap, top-most Escape handling, shake
debounce), `Avatar`/`AiAvatar`/`AiPill`, `Skeleton`, `Toast`, `ThemeToggle`/
`ThemeSegmented`, `OfflineBanner`, `StreamAnnouncer`, `Markdown` + `CitationList`/
`AttachmentChip` (server-verified citations only), `Reveal`/`RevealItem`/`SectionHeading`,
`lib/motion.ts`, `lib/focus.ts`, `lib/utils.ts` (`safeInternalPath`, `partitionPinned`, …).

These already pass `tests/a11y/components.axe.test.tsx` (13 tests) and
`tests/keyboard-focus.test.tsx` (15 tests). The redesign **extends** them; it does not
re-implement them.

## 6. Proposed AARAGATE design direction

**Positioning:** *Your intelligent gateway to GATE preparation.*

**Voice:** academic, precise, calm. No hype, no rank guarantees, no fabricated analytics,
no chatbot clichés.

**Logo concept — "the gate and the ascent."** An arch (the gateway into preparation)
struck in white on an indigo tile, with an ascending polyline and a single amber node
inside it: the route through the syllabus and the point of mastery. Three strokes, no
`<defs>`, no ids, no runtime measurement, so it renders identically at 16px (favicon) and
64px (splash). Variants: `tile` (indigo slab, app chrome) and `mono` (currentColor, for
footers and inverted surfaces).

**Wordmark:** `AARA` + `GATE` in Inter 600, the second half in `--accent-text`
(AA-validated on every surface it is placed on), uppercase, `-0.01em` tracking.

**Palette — "ink and ascent."** The existing token contract is re-hued, not replaced: a
deeper academic indigo (`#4338ca` light, `#5555ee` dark) as `--brand`/`--accent`, plus a
new **amber/ascent** family (`--gold-500`) reserved exclusively for progress, mastery and
trend signal. Ink blues (`--brand-ink-*`) give the mark depth. Every new value is added to
`scripts/contrast.mjs`; the gate must stay green.

**Typography:** Inter for UI (existing self-hosted faces), JetBrains Mono for exam
notation, code and answer keys. Numerals matter here — result readouts use `tabular-nums`.

**Motion language:** *draw, settle, never bounce.* The existing 120/200/320/480ms tokens
are kept. New vocabulary: a one-shot stroke draw for the logo, opacity-only page
transitions, and status transitions (queued → extracting → ready) as a colour/dot change
with no layout shift. Nothing loops except the typing dots and the streaming caret that
already existed. Under `prefers-reduced-motion` everything collapses to the **final**
state, never a slower version.

**Iconography:** Lucide only, 1.5–2px stroke, 16/18/20px. Study-domain mapping:
`Sparkles` → assistant, `FileText`/`Files` → documents, `ListChecks` → practice,
`Timer` → timed tests, `TrendingUp` → analysis, `GraduationCap` → GATE branch.
No emoji-as-iconography.

**Component rules:** one radius scale (6/12/20/pill), one elevation ladder, borders
`--border-default` with `--border-strong` for interactive hover, the accent used at most
twice per viewport, the focus ring never removed, and every destructive action behind
`ConfirmDialog`.

## 7. Implementation batches

### Batch A — brand foundation ✅ *implemented this pass*

- `src/lib/brand.ts` — name, wordmark halves, assistant name, tagline, metadata
  description, the disclaimers that must never drift, supported document formats, and
  `PRIMARY_AREAS` (the IA annotated with what is actually implemented).
- `src/components/logo.tsx` — new `Logo` (variants `tile`/`mono`), `Wordmark`,
  `LogoLoader` (CSS-only gate-draw, one-shot, reduced-motion safe, no client boundary).
- `src/app/globals.css` — additive brand layer: ink + ascent tokens in `:root` and `.dark`,
  `@theme` mappings, `.gate-*` draw keyframes.
- `src/app/icon.svg`, `src/app/manifest.ts` — favicon + web app manifest concept.
- `src/app/layout.tsx` — metadata, OG, theme color.
- `src/app/app/loading.tsx` — the first route-level loading state in the app.

### Batch B — shared UI ✅ *implemented this pass*

- New primitives: `ui/card.tsx`, `ui/badge.tsx`, `ui/alert.tsx`, `ui/empty-state.tsx`,
  `ui/tabs.tsx`; `ui/skeleton.tsx` gains list/grid/text variants.
- `layout/sidebar.tsx` rebuilt around AARAGATE IA: brand header, primary nav to
  **implemented routes only**, "Study groups" instead of "Rooms", explicit empty state.
- Copy pass on `new-conversation-modal.tsx`, `join-modal.tsx`, `command-palette.tsx`,
  `lib/utils.ts`, `lib/pricing.ts`, `lib/data-export.ts`.
- Wordmark adoption: landing nav, auth shell, pricing, changelog, app mobile bar.
- `scripts/contrast.mjs` extended with 18 new token pairs.

### Batch C — core screens ⏳ *next*

Landing page rewrite (value proposition, document-grounded learning, paper analysis,
practice/quiz explanation, responsible-AI disclaimer, real footer) · auth screens
(verification + reset states, password visibility, success/error/loading) · dashboard
built from real data only · AI study assistant (message structure, copy action,
follow-ups, listed sources, group semantics removed) · Documents workspace over the
existing attachment pipeline (upload, validation, processing/extraction status, delete
with confirm, privacy copy).

### Batch D — learning screens ⏳ *blocked, see §8.1*

Practice, mock tests, results and trend analysis. **Not buildable on this backend yet.**

## 8. Risks, blockers and honest scope limits

1. **No question-paper, practice, quiz or analytics data model exists.** The schema has
   `conversations`, `messages`, `attachments`, `attachment_chunks`, `citations`,
   `reactions`, `profiles`, `invites`, rate-limit and moderation tables. There is no
   `question_papers`, `questions`, `attempts`, `subjects` or `branches` table. Per the
   brief's own rules (*"only create routes supported by the implemented feature scope"*,
   *"do not implement charts that display fabricated analytics"*), **Practice, Mock tests
   and Trends are deliberately not routed.** A nav item pointing at a page that cannot
   compute a real score would be exactly the broken placeholder the brief forbids.
   Unblocking needs a migration (paper → question → attempt → per-subject mastery) plus an
   Edge Function for generation and grading, then Batch D.
2. **"Selected GATE branch" is not persisted.** `profiles` has no branch column, so a
   branch selector would forget the choice on reload. The dashboard therefore ships with
   real data (conversations, documents, processing status) until a `gate_branch` migration
   lands with the onboarding step that writes it.
3. **Group chat is real, tested functionality.** The brief asks to remove group-chat
   *terminology and navigation*, not the tested capability — and it also says not to delete
   shared infrastructure without verifying dependencies. This pass removes the
   room/social vocabulary from the shared UI and keeps the underlying conversation model
   (covered by RLS policies, the invite Edge Function and 215 passing tests). Deleting the
   feature outright is a product decision with a schema/test blast radius and is **not**
   done silently here.
4. **Seeded demo data is group-chat shaped** (`"Launch war room"`, `"Design crew"`).
   Renaming seeds touches `tests/data-export.test.ts`, `tests/dialog-focus-regression.test.tsx`
   and `e2e/*`. Strings are renamed in the same pass that moves them; e2e copy was updated
   textually but **cannot be executed in this environment** (no Chromium), so its pass
   status is unverified — same limitation already recorded in `AUDIT.md`.
5. **Reduced motion + hydration.** The logo animation is pure CSS with
   `animation-fill-mode: both`, so the reduced-motion instant cut lands on the finished
   mark: no hydration mismatch, no client boundary, no layout shift (fixed-size SVG).
6. **Duplicated SVG `id`s in the old logo** disappear as a side effect of the new mark
   using no `<defs>` at all.
7. **Export filename changes** to `aaragate-export-<date>.json`; the two assertions that
   encode the old name (`tests/data-export.test.ts`, `e2e/settings.spec.ts`) are updated.
8. **Not yet done, tracked:** README/SECURITY/RELEASING prose still describes the old
   product; `changelog` fallback release notes and the landing hero body copy are Batch C;
   the composer's `@ai` affordance is Batch C; there is no `error.tsx`.