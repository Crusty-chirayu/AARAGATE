"use client";

import * as React from "react";
import { Check, CircleMinus, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMarks, UNANSWERED, type NatRange, type Response, type Verdict } from "@/lib/quiz";
import { PROVENANCE_LABEL, type PublicQuestion } from "@/lib/attempts";

/** The key and verdict, present only once the paper has been submitted. */
export interface QuestionReveal {
  verdict: Verdict;
  answer: string[] | null;
  natRange: NatRange | null;
  explanation: string | null;
}

/**
 * One question on a practice paper.
 *
 * The input control follows the question kind, because the kinds are genuinely
 * different interactions and not one control with a flag: MCQ is a radio group
 * (exactly one), MSQ is a checkbox set (an exact set match, no partial credit),
 * NAT is a number.
 *
 * Two rules are load-bearing:
 *
 *  - **The answer is never on screen before submission.** This component takes
 *    a `PublicQuestion`, which structurally has no `answer`, `nat_range` or
 *    `explanation`. The key arrives only through `reveal`, which the session
 *    screen supplies after the attempt is scored.
 *  - **Correctness is never signalled by colour alone.** Every verdict carries
 *    its own icon and its own word, so the review screen still reads for a
 *    colour-blind student and in forced-colours mode.
 */
export function QuestionCard({
  question,
  response,
  onResponse,
  reveal,
  disabled = false,
}: {
  question: PublicQuestion;
  response: Response;
  onResponse: (response: Response) => void;
  /** Present only after submission. Absent while the paper is being answered. */
  reveal?: QuestionReveal;
  disabled?: boolean;
}) {
  const answered = response.kind !== "unanswered";

  /** Flip one option, producing the response shape the question's kind expects. */
  const toggleOption = (id: string) => {
    if (disabled) return;
    const selected = response.kind === "options" ? response.selected : [];

    if (question.kind === "MCQ") {
      // Re-picking the chosen option clears it, so a student can undo a
      // mis-click without reloading the paper.
      onResponse(selected[0] === id ? UNANSWERED : { kind: "options", selected: [id] });
      return;
    }

    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
    onResponse(next.length === 0 ? UNANSWERED : { kind: "options", selected: next });
  };

  const isChosen = (id: string) => response.kind === "options" && response.selected.includes(id);
  const isKey = (id: string) => (reveal?.answer ?? []).includes(id);

  return (
    <li
      id={`question-${question.index + 1}`}
      className="scroll-mt-24 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--e1)]"
    >
      <fieldset disabled={disabled}>
        <legend className="w-full">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-semibold tabular-nums text-[var(--fg-subtle)]">
              Q{question.index + 1}
            </span>
            <Badge tone="neutral" size="sm">
              {question.kind}
            </Badge>
            <Badge tone="neutral" size="sm">
              {question.marks} mark{question.marks === 1 ? "" : "s"}
            </Badge>
            {question.provenance === "ai_generated" ? (
              <Badge tone="ai" size="sm" icon={Sparkles}>
                {PROVENANCE_LABEL.ai_generated}
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                {PROVENANCE_LABEL.sample}
              </Badge>
            )}
            {question.topic && (
              <span className="text-[11.5px] text-[var(--fg-subtle)]">{question.topic}</span>
            )}
          </div>
          <p className="text-[13.5px] leading-relaxed text-[var(--fg)]">{question.text}</p>
          {question.kind === "MSQ" && (
            <p className="mt-1 text-[12px] text-[var(--fg-subtle)]">
              Select every correct option. There is no partial credit.
            </p>
          )}
          {question.kind === "NAT" && (
            <p className="mt-1 text-[12px] text-[var(--fg-subtle)]">
              Enter a number. There is no negative marking for a wrong value.
            </p>
          )}
        </legend>

        {question.kind === "NAT" ? (
          <NumericAnswer
            value={response.kind === "numeric" ? response.value : null}
            onChange={(value) => onResponse(value === null ? UNANSWERED : { kind: "numeric", value })}
            disabled={disabled}
            index={question.index}
          />
        ) : (
          <ul className="mt-3 space-y-1.5">
            {question.options.map((option) => (
              <li key={option.id}>
                <OptionRow
                  kind={question.kind}
                  name={`q${question.index}`}
                  id={option.id}
                  text={option.text}
                  chosen={isChosen(option.id)}
                  revealed={reveal !== undefined}
                  isKey={isKey(option.id)}
                  onToggle={() => toggleOption(option.id)}
                  disabled={disabled}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {reveal && <RevealBlock question={question} reveal={reveal} answered={answered} />}
    </li>
  );
}

/** Native radio/checkbox styled as a full-width row. */
function OptionRow({
  kind,
  name,
  id,
  text,
  chosen,
  revealed,
  isKey,
  onToggle,
  disabled,
}: {
  kind: PublicQuestion["kind"];
  name: string;
  id: string;
  text: string;
  chosen: boolean;
  revealed: boolean;
  isKey: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const inputId = `${name}-${id}`;
  // Before submission the row shows only the student's own choice. After it,
  // the key is marked. A chosen option that is also the key reads as "both",
  // which is why the two states stay independent rather than becoming one enum.
  const state = revealed
    ? isKey && chosen
      ? "correct"
      : isKey
        ? "missed"
        : chosen
          ? "wrong"
          : "idle"
    : "idle";

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-[var(--r-md)] border px-3 py-2 text-[13px] transition-colors duration-[var(--d-micro)]",
        !disabled && "hover:bg-[var(--bg-hover)]",
        state === "correct" && "border-[var(--success)]/45 bg-[var(--success-subtle)]",
        state === "wrong" && "border-[var(--danger)]/45 bg-[var(--danger-subtle)]",
        state === "missed" && "border-[var(--accent-border)] bg-[var(--accent-subtle)]",
        state === "idle" &&
          (chosen ? "border-[var(--accent)]/45 bg-[var(--accent-subtle)]" : "border-[var(--border)]"),
        disabled && "cursor-default",
      )}
    >
      <input
        id={inputId}
        name={name}
        type={kind === "MSQ" ? "checkbox" : "radio"}
        checked={chosen}
        onChange={onToggle}
        disabled={disabled}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="mr-1.5 font-semibold text-[var(--fg-muted)]">{id}.</span>
        <span className="text-[var(--fg)]">{text}</span>
        {revealed && isKey && (
          <span className="ml-1.5 text-[11.5px] font-medium text-[var(--success)]">
            correct answer
          </span>
        )}
      </span>
    </label>
  );
}


/** The single numeric field a NAT question uses. */
function NumericAnswer({
  value,
  onChange,
  disabled,
  index,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
  index: number;
}) {
  const id = `q${index}-numeric`;
  return (
    <div className="mt-3 space-y-1.5">
      <label htmlFor={id} className="block text-[12.5px] font-medium text-[var(--fg)]">
        Your answer
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        value={value === null ? "" : String(value)}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          // A partially typed value like "-" or "1e" must clear the response
          // rather than be coerced to 0, which would silently score as a wrong
          // answer the student never gave.
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
        className="h-10 w-40 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm tabular-nums text-[var(--fg)] focus:border-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--accent)]/12 disabled:opacity-60"
      />
    </div>
  );
}

/**
 * The post-submission block: verdict, the key, and the explanation.
 *
 * The verdict is a word plus an icon plus a colour, never a colour alone, and a
 * skipped question says "skipped" rather than "wrong" — the two are scored
 * differently and the review must not blur them.
 */
function RevealBlock({
  question,
  reveal,
  answered,
}: {
  question: PublicQuestion;
  reveal: QuestionReveal;
  answered: boolean;
}) {
  const { verdict, answer, natRange, explanation } = reveal;
  const outcome = verdict.outcome;
  const label = outcome === "correct" ? "Correct" : outcome === "wrong" ? "Wrong" : "Skipped";
  const Icon = outcome === "correct" ? Check : outcome === "wrong" ? X : CircleMinus;
  const shell =
    outcome === "correct"
      ? "border-[var(--success)]/35 bg-[var(--success-subtle)]"
      : outcome === "wrong"
        ? "border-[var(--danger)]/35 bg-[var(--danger-subtle)]"
        : "border-[var(--border)] bg-[var(--bg-subtle)]";
  const ink =
    outcome === "correct"
      ? "text-[var(--success)]"
      : outcome === "wrong"
        ? "text-[var(--danger)]"
        : "text-[var(--fg-muted)]";

  // The key, stated in words, so a skipped or wrong question still teaches
  // something. Null when the key is genuinely unavailable.
  const keyLine =
    question.kind === "NAT"
      ? natRange
        ? `Accepted range: ${natRange.min} to ${natRange.max}`
        : null
      : (answer ?? []).length > 0
        ? `Correct option${(answer ?? []).length === 1 ? "" : "s"}: ${(answer ?? []).join(", ")}`
        : null;

  return (
    <div className={cn("mt-3 rounded-[var(--r-md)] border p-3", shell)}>
      <p className={cn("flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold", ink)}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
        <span className="font-normal text-[var(--fg-muted)]">
          · {formatMarks(verdict.awarded)} of {verdict.max}
          {outcome === "unanswered" && answered ? " (nothing selected)" : ""}
        </span>
      </p>

      {keyLine && <p className="mt-1.5 text-[12.5px] text-[var(--fg)]">{keyLine}</p>}

      {explanation && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">{explanation}</p>
      )}

      {question.provenance === "ai_generated" && (
        <p className="mt-1.5 text-[11.5px] text-[var(--fg-subtle)]">
          This explanation was produced by a language model. Check it against your own notes.
        </p>
      )}
    </div>
  );
}

