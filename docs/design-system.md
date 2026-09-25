# AARAGATE Design System

AARAGATE is designed as an **authoritative, academically serious study desk for GATE preparation, with an intelligent worked-solution tutor built into it**.

This document defines the visual foundations, tokens, components, and design discipline to ensure the interface maintains its unique identity and avoids visual drift.

---

## 1. Core Visual Metaphor: THE GATE & THE STUDY DESK

AARAGATE rejects the generic AI chat and SaaS admin aesthetics (no purple neon gradients, no excessive floating pills, no fake gamification streaks). Instead, it embodies:

```
Preparation → Understanding → Practice → Mastery
```

* **Surface Philosophy:** Solid academic desk surfaces (warm paper light, deep graphite dark) rather than translucent glassmorphism or floating bubbles.
* **Tonal Hierarchy:** Visual depth is communicated through tonal surface shifts and hairline borders, not heavy blurred shadows or neon glows.
* **Visual Restraint:** The interface feels calm and durable for long, 4-hour technical problem-solving sessions without cognitive fatigue.

---

## 2. Color System & Contrast Tokens

All components consume standardized CSS custom properties defined in `src/app/globals.css`. Hardcoded hex values in component styling are strictly prohibited.

### 2.1 Academic Themes

| Role | Light Theme (Warm Paper) | Dark Theme (Deep Study) | Purpose |
| :--- | :--- | :--- | :--- |
| **Page Canvas (`--bg`)** | `#f9f8f5` (warm archival paper) | `#101214` (warm charcoal) | Main background |
| **Desk Surface (`--surface`)** | `#ffffff` (crisp ivory paper) | `#171a1d` (graphite slate) | Cards, panels, questions |
| **Raised Surface (`--bg-surface-raised`)** | `#f3f0ea` | `#1e2226` | Modals, sticky toolbars |
| **Hairline Border (`--border`)** | `rgba(26, 29, 31, 0.12)` | `rgba(242, 240, 236, 0.12)` | Structural separation |
| **Strong Border (`--border-strong`)** | `rgba(26, 29, 31, 0.22)` | `rgba(242, 240, 236, 0.22)` | Interactive controls |
| **Primary Text (`--fg`)** | `#1a1d1f` (charcoal ink) | `#f2f0ec` (archival ivory) | Headers, question text |
| **Muted Text (`--fg-muted`)** | `#4a5258` | `#939ca3` | Secondary text, hints |
| **Subtle Text (`--fg-subtle`)** | `#59636a` | `#838d94` | Timestamps, metadata |

### 2.2 Brand & Persona Tokens

* **GATE Academic Vermilion (`--brand` / `--accent`):**
  * Light: `#b83a22` (hover: `#9e2b17`, active: `#872412`, subtle: `#faece7`, text: `#9e2b17`)
  * Dark: `#c53d25` (hover: `#b5341d`, active: `#b3351f`, subtle: `#381610`, text: `#f57b64`)
  * Used for: Primary actions, active question selection, GATE brand mark, critical indicators.
* **Scholar Teal (`--scholar-teal` / `--ai`):**
  * Light: `#0d665c` (subtle: `#dff0ec`, text: `#0d665c`)
  * Dark: `#1ab39f` (subtle: `#0a2925`, text: `#1ab39f`)
  * Used for: AI Tutor persona identity, verified citation badges, AI pill, tutor derivations.
* **Archival Highlighter (`--ascent-highlighter`):**
  * Light: `#fef3c7` (text: `#875500`)
  * Dark: `#33250c` (text: `#ebb044`)
  * Used for: Verified grounding source chips, cited textbook passage indicators.

### 2.3 Semantic Colors

Every semantic state is paired with text and an icon—never signaled by color alone.

| State | Light Fill | Dark Fill | Text / Ink | Icon Pairing |
| :--- | :--- | :--- | :--- | :--- |
| **Success** | `#0d7045` | `#18c77a` | `var(--success)` | Check, CheckCircle2 |
| **Warning** | `#855500` | `#f5b942` | `var(--warning)` | AlertTriangle |
| **Danger** | `#b82c2c` | `#ef5b62` | `var(--danger)` | XCircle, AlertCircle |
| **Info** | `#155bb5` | `#5ba7ff` | `var(--info)` | Info, HelpCircle |

### 2.4 Contrast Enforcement (WCAG 2.2 AA)

* Body text on background: ≥ 4.5:1 (actual: 15.95:1 light, 16.49:1 dark).
* Muted text on surfaces: ≥ 4.5:1 (actual: ≥ 6.26:1).
* UI boundaries & icons: ≥ 3.0:1 (actual: ≥ 5.16:1).
* Verified programmatically via `npm run test:contrast` (68/68 automated checks passing).

---

## 3. Typography Hierarchy

AARAGATE uses a distinguished tri-font architecture:
1. **Editorial Serif (`--font-serif`):** Classical academic display typeface for landing statements and formal score report titles.
2. **Humanist Sans (`--font-sans` / Inter):** Exceptionally readable UI and question typography supporting English, Hindi, and Hinglish.
3. **Technical Monospace (`--font-mono` / JetBrains Mono):** Clean numbers, question index codes, exam clocks, and code blocks.

### Typography Scale

| Token | Class / Spec | Use Case |
| :--- | :--- | :--- |
| **Display** | `text-4xl sm:text-6xl font-serif font-semibold tracking-tight` | Landing hero title |
| **H1** | `text-[22px] font-semibold tracking-tight` | Exam headers, major page titles |
| **H2** | `text-[18px] sm:text-[20px] font-semibold` | Section titles, card headers |
| **H3** | `text-[15px] sm:text-[16px] font-semibold` | Question title, feature headings |
| **Body** | `text-[14px] leading-relaxed` | Tutor derivations, question text |
| **Mono / Code** | `font-mono text-[13px] tabular-nums` | Exam timer, marks, code blocks |
| **Metadata** | `text-[11.5px] font-medium tracking-wide uppercase` | Question kinds (MCQ/MSQ/NAT), timestamps |

---

## 4. Spacing Scale

Based on a strict 4px grid. Components must strictly use the spacing scale:

```css
0px, 2px, 4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px, 64px, 80px, 96px, 128px
```

* Density: Dense UI uses 8px–12px padding; desktop panels use 16px–24px.
* Section rhythm: 64px–96px vertical separation on public surfaces.

---

## 5. Radius System

A restrained, geometric radius language prevents childish bubble aesthetics:

* `--r-xs`: 2px (subtle tags, indicators)
* `--r-sm`: 4px (badges, small buttons)
* `--r-md`: 6px (form inputs, message bubbles, option rows)
* `--r-lg`: 10px (study desk cards, question cards, modal containers)
* `--r-xl`: 14px (primary panels, interactive demos)
* `--r-full`: 9999px (avatars, status pills)

Concentric rule: Nested containers maintain concentric border radii (inner radius = outer radius - padding).

---

## 6. Surfaces, Elevation & Shadows

Depth is established by solid tonal layers and crisp inset borders:

```
Page Canvas (--bg)
  ↓
Desk Rail / Sidebar (--bg-surface)
  ↓
Study Card (--surface) [Border: 1px solid var(--border)]
  ↓
Raised Surface (--bg-surface-raised) [Shadow: var(--e2)]
  ↓
Dialog / Popover (--bg-surface-raised) [Shadow: var(--e3)]
```

* `--e1`: Subtle resting shadow (`0 1px 2px rgba(0,0,0,0.05)`)
* `--e2`: Hover / elevated panel (`0 4px 12px rgba(0,0,0,0.08)`)
* `--e3`: Modal / menu overlay (`0 12px 32px rgba(0,0,0,0.18)`)
* No glowing borders or blurred colored drop-shadows.

---

## 7. Motion & Interaction

Motion communicates state transitions and spatial hierarchy:

* Spring curves: `damping: 24, stiffness: 280` (calm and responsive, zero bounce).
* Properties animated: `transform`, `opacity`, `clip-path`.
* Layout dimension animations (`width`, `height`) are strictly avoided to prevent layout thrashing.
* Reduced Motion (`prefers-reduced-motion: reduce`):
  * All decorative motion is stripped.
  * Transitions are instant or pure opacity fades.
  * Hero demo halts animation and renders static scripts cleanly.

---

## 8. Core Component Patterns

### 8.1 The Gate Logo (`<Logo />`)
* Distinctive gate mark symbolizing the four rungs of mastery: Preparation, Understanding, Practice, Mastery.
* Sizing: `sm` (20px), `md` (24px), `lg` (32px), with responsive Wordmark lockup.

### 8.2 Worked-Solution AI Tutor (`<ChatView />` & `<MessageItem />`)
* Tutor responses render inside an academic container with distinct Scholar Teal identification.
* Text streaming subscribes externally (`StreamingTextSource`) so each token update isolates to the text leaf without re-rendering parent message items.
* Citing source passages via `<CitationList />`: Archival highlighter chip showing `"Grounded in your material (N verified sources)"` with page references (`p. 42`).

### 8.3 Tactile Composer (`<Composer />`)
* Docked, compact writing desk instrument.
* Integrated attachment drawer, IME-safe typing (supporting Hindi, Hinglish, English), and keyboard triggers (Enter to submit, Shift+Enter for newline).
* Does not float as a detached pill capsule.

### 8.4 Examination Practice (`<QuestionCard />` & `<QuestionPalette />`)
* **Question Card:** Formatted like an official GATE examination sheet.
  * Question kind badge (`MCQ`, `MSQ`, `NAT`).
  * Marks allocation and negative marking rules.
  * Option rows with radio/checkbox controls.
  * Numerical answer input with decimal support for NAT questions.
* **Question Palette:**
  * Displays all questions with state indicator: Answered (accent-subtle fill + check icon), Unanswered (border + dash), Current.
  * Accessible label: `Question N, answered` / `Question N, not answered`.
  * Smooth scrolling to target question on click.
* **Exam Clock:** Live elapsed timer derived from attempt creation time (`role="timer"`).

### 8.5 Study Rooms & AI Posture Selector
* Header clearly displays member presence, room topic, and current AI participation posture:
  * **Off:** Humans only. Assistant never reads or posts.
  * **Mention-only:** Tutor only responds when explicitly called with `@ai`.
  * **Auto:** Tutor acts as a full batch study participant.

---

## 9. Do / Don't Guidelines

### Do:
* **Do** use semantic HTML (`<main>`, `<nav>`, `<fieldset>`, `<legend>`, `<ol>`, `<li>`).
* **Do** pair color with icons and descriptive text for all status indicators.
* **Do** show authentic data: real filenames, actual byte sizes, real page counts, exact scoring formulas.
* **Do** provide clear error recovery actions ("Try again", "Use a different email").

### Don't:
* **Don't** add glowing neon borders, cyberpunk gradients, or blurred aurora blobs.
* **Don't** use floating capsule composer bars that block message history.
* **Don't** invent fake student counts, fake testimonials, fake GATE ranks, or fake score predictions.
* **Don't** rely on color alone to communicate correctness or submission states.
* **Don't** alter backend database schemas, storage rules, or AI routing logic during UI redesign.
