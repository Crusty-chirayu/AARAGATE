-- ============================================================================
-- 20260920000000_quiz_attempts.sql
--
-- Quiz attempt storage for the practice/quiz system.
--
-- Contract source of truth: src/lib/attempts.ts + src/lib/quiz.ts and the
-- client data layer src/lib/data/attempts.ts, which:
--   - inserts the attempt row first, then the question snapshot items,
--     rolling the attempt back if the items insert fails;
--   - reads attempts back only through get_quiz_attempt(), so the answer key
--     inside the stored question snapshot is never directly selectable;
--   - submits through submit_quiz_attempt(), sending responses only — the
--     score is computed server-side from the stored snapshot, so the client
--     cannot author its own result and an already-submitted paper cannot be
--     rescored.
--
-- Ownership: every table row and both RPCs are scoped by auth.uid(). The
-- items table carries a composite foreign key back to the attempt, so a
-- mismatched user_id on an item row is structurally impossible.
-- ============================================================================

begin;

create table if not exists public.quiz_attempts (
  id                 uuid primary key,
  user_id            uuid        not null references auth.users (id) on delete cascade,
  branch             text        not null,
  subject            text        not null,
  topic              text,
  difficulty         text        not null,
  source_document_id uuid        references public.documents (id) on delete set null,
  created_at         timestamptz not null default now(),
  question_count     integer     not null check (question_count >= 0),
  submitted_at       timestamptz,
  -- Populated only by submit_quiz_attempt(). The client never writes here.
  result             jsonb,
  verdicts           jsonb,
  responses          jsonb,
  -- A scored attempt must carry its score; an unscored one must not.
  constraint scored_state_consistent check (
    (submitted_at is null and result is null and verdicts is null and responses is null)
    or
    (submitted_at is not null and result is not null and verdicts is not null and responses is not null)
  )
);

create table if not exists public.quiz_attempt_items (
  attempt_id uuid        not null references public.quiz_attempts (id) on delete cascade,
  -- Composite FK guarantees the item's owner equals the attempt's owner;
  -- a mismatched user_id cannot be inserted at all.
  user_id    uuid        not null,
  position   integer     not null check (position >= 0),
  kind       text        not null check (kind in ('MCQ', 'MSQ', 'NAT')),
  marks      numeric     not null check (marks > 0),
  subject    text        not null,
  topic      text,
  difficulty text        not null,
  provenance text        not null check (provenance in ('sample', 'ai_generated', 'source')),
  -- Full validated question snapshot, including the answer key. Never
  -- exposed to the client before submission (see get_quiz_attempt).
  question   jsonb       not null,
  primary key (attempt_id, position),
  foreign key (attempt_id, user_id)
    references public.quiz_attempts (id, user_id)
    on delete cascade
);

-- A unique (id, user_id) is required on the parent for the composite FK above.
create unique index if not exists quiz_attempts_id_user_idx
  on public.quiz_attempts (id, user_id);

create index if not exists quiz_attempts_user_created_idx
  on public.quiz_attempts (user_id, created_at desc);

create index if not exists quiz_attempt_items_attempt_position_idx
  on public.quiz_attempt_items (attempt_id, position);

-- ---------------------------------------------------------------------------
-- RLS: owner-only access on both tables. Nothing is world-readable.
-- ---------------------------------------------------------------------------

alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_items enable row level security;

create policy quiz_attempts_select_own on public.quiz_attempts
  for select using (auth.uid() = user_id);

create policy quiz_attempts_insert_own on public.quiz_attempts
  for insert with check (auth.uid() = user_id);

-- No UPDATE policy: an attempt's rows are written at creation and at
-- submission. Submission goes through submit_quiz_attempt() (security
-- definer), so the client cannot mutate score fields directly.

create policy quiz_attempts_delete_own on public.quiz_attempts
  for delete using (auth.uid() = user_id);

create policy quiz_attempt_items_select_own on public.quiz_attempt_items
  for select using (auth.uid() = user_id);

create policy quiz_attempt_items_insert_own on public.quiz_attempt_items
  for insert with check (auth.uid() = user_id);

create policy quiz_attempt_items_delete_own on public.quiz_attempt_items
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPCs
--
-- Both are SECURITY DEFINER so they can read the answer key inside the item
-- snapshots, which RLS hides from the client. Both re-check auth.uid()
-- explicitly — a definer function must not rely on RLS alone — and both pin
-- search_path so a malicious schema cannot shadow anything.
-- ---------------------------------------------------------------------------

-- Mirror of roundMarks() in src/lib/quiz.ts: two decimals.
create or replace function public.quiz_round_marks(v numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(v::numeric, 2);
$$;

-- Mirror of scoreQuestion() in src/lib/quiz.ts.
--   p_question: the stored snapshot jsonb (kind, marks, answer, nat_range).
--   p_response: {kind:"unanswered"} | {kind:"options",selected:[...]}
--               | {kind:"numeric",value:n}
-- Returns the Verdict json: {outcome, awarded, max}.
create or replace function public.quiz_score_question(p_question jsonb, p_response jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_kind      text := p_question->>'kind';
  v_max       numeric := (p_question->>'marks')::numeric;
  v_resp_kind text := coalesce(p_response->>'kind', 'unanswered');
  v_selected  jsonb;
  v_key       jsonb;
  v_correct   boolean;
begin
  if v_resp_kind = 'unanswered' then
    return jsonb_build_object('outcome', 'unanswered', 'awarded', 0, 'max', v_max);
  end if;

  -- A numeric response to an option question (or vice versa) is a caller bug,
  -- not a wrong answer: score it as unanswered, never as a penalty.
  if (v_kind = 'NAT') <> (v_resp_kind = 'numeric') then
    return jsonb_build_object('outcome', 'unanswered', 'awarded', 0, 'max', v_max);
  end if;

  if v_kind = 'NAT' then
    if p_question->'nat_range' is null or p_response->>'value' is null
       or (p_response->>'value')::text !~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' then
      return jsonb_build_object('outcome', 'wrong', 'awarded', 0, 'max', v_max);
    end if;
    v_correct :=
      (p_response->>'value')::numeric >= (p_question->'nat_range'->>'min')::numeric
      and (p_response->>'value')::numeric <= (p_question->'nat_range'->>'max')::numeric;
    return jsonb_build_object(
      'outcome', case when v_correct then 'correct' else 'wrong' end,
      'awarded', case when v_correct then v_max else 0 end,
      'max', v_max);
  end if;

  v_selected := coalesce(p_response->'selected', '[]'::jsonb);
  if jsonb_array_length(v_selected) = 0 then
    -- Nothing ticked is a skip, not a wrong answer.
    return jsonb_build_object('outcome', 'unanswered', 'awarded', 0, 'max', v_max);
  end if;

  v_key := coalesce(p_question->'answer', '[]'::jsonb);

  if v_kind = 'MSQ' then
    -- Exact set match: same length and every selection present in the key.
    v_correct := jsonb_array_length(v_selected) = jsonb_array_length(v_key)
      and not exists (
        select 1 from jsonb_array_elements_text(v_selected) as s(id)
        where s.id not in (select k from jsonb_array_elements_text(v_key) as k(k))
      );
    return jsonb_build_object(
      'outcome', case when v_correct then 'correct' else 'wrong' end,
      'awarded', case when v_correct then v_max else 0 end,
      'max', v_max);
  end if;

  -- MCQ: exactly one selection, and it must be the key.
  v_correct := jsonb_array_length(v_selected) = 1
    and v_selected->>0 in (select k from jsonb_array_elements_text(v_key) as k(k));
  if v_correct then
    return jsonb_build_object('outcome', 'correct', 'awarded', v_max, 'max', v_max);
  end if;
  return jsonb_build_object(
    'outcome', 'wrong',
    'awarded', public.quiz_round_marks(-v_max / 3),
    'max', v_max);
end;
$$;

-- Read one attempt. Before submission the question snapshots are stripped of
-- answer, nat_range and explanation (the key); after submission everything is
-- returned so the review screen can render verdicts. Ownership is enforced by
-- auth.uid() here as well as by RLS on the underlying tables.
create or replace function public.get_quiz_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_attempt   public.quiz_attempts;
  v_items     jsonb;
  v_submitted boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_attempt
  from public.quiz_attempts
  where id = p_attempt_id and user_id = auth.uid();
  if not found then
    return null;
  end if;

  v_submitted := v_attempt.submitted_at is not null;

  select coalesce(jsonb_agg(
      (case when v_submitted then i.question
            else i.question - 'answer' - 'nat_range' - 'explanation'
       end)
      || jsonb_build_object(
        'index', i.position,
        'subject', i.subject,
        'topic', i.topic,
        'difficulty', i.difficulty,
        'provenance', i.provenance)
      order by i.position
    ), '[]'::jsonb)
  into v_items
  from public.quiz_attempt_items i
  where i.attempt_id = p_attempt_id and i.user_id = auth.uid();

  return jsonb_build_object(
    'id', v_attempt.id,
    'branch', v_attempt.branch,
    'subject', v_attempt.subject,
    'topic', v_attempt.topic,
    'difficulty', v_attempt.difficulty,
    'sourceDocumentId', v_attempt.source_document_id,
    'created_at', v_attempt.created_at,
    'submitted_at', v_attempt.submitted_at,
    'questions', v_items,
    'responses', case when v_submitted then v_attempt.responses else null end,
    'verdicts',  case when v_submitted then v_attempt.verdicts  else null end,
    'result',    case when v_submitted then v_attempt.result    else null end
  );
end;
$$;

-- Score and finalise an attempt. The client sends responses only; the score is
-- computed here from the stored snapshots, so the client cannot author its own
-- result. Atomicity: the parent row is locked FOR UPDATE, so a concurrent
-- double-submit serialises — the second caller sees submitted_at set and is
-- rejected rather than scoring twice.
create or replace function public.submit_quiz_attempt(
  p_attempt_id uuid,
  p_responses  jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_attempt  public.quiz_attempts;
  v_item     record;
  v_response jsonb;
  v_verdict  jsonb;
  v_verdicts jsonb := '{}'::jsonb;
  v_stored   jsonb := '{}'::jsonb;
  v_result   jsonb;
  v_awarded  numeric := 0;
  v_max      numeric := 0;
  v_correct  integer := 0;
  v_wrong    integer := 0;
  v_skipped  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_responses is null or jsonb_typeof(p_responses) <> 'object' then
    raise exception 'Responses must be a JSON object keyed by question index.';
  end if;

  select * into v_attempt
  from public.quiz_attempts
  where id = p_attempt_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Attempt not found.' using errcode = 'P0002';
  end if;
  if v_attempt.submitted_at is not null then
    raise exception 'This attempt has already been submitted.';
  end if;

  for v_item in
    select * from public.quiz_attempt_items
    where attempt_id = p_attempt_id and user_id = auth.uid()
    order by position
  loop
    v_response := coalesce(
      p_responses -> v_item.position::text,
      jsonb_build_object('kind', 'unanswered'));
    v_verdict := public.quiz_score_question(v_item.question, v_response);

    v_verdicts := v_verdicts || jsonb_build_object(v_item.position::text, v_verdict);
    v_stored   := v_stored   || jsonb_build_object(v_item.position::text, v_response);
    v_awarded  := v_awarded + (v_verdict->>'awarded')::numeric;
    v_max      := v_max      + (v_verdict->>'max')::numeric;
    if v_verdict->>'outcome' = 'correct' then v_correct := v_correct + 1;
    elsif v_verdict->>'outcome' = 'wrong' then v_wrong := v_wrong + 1;
    else v_skipped := v_skipped + 1;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'awarded', public.quiz_round_marks(v_awarded),
    'max', public.quiz_round_marks(v_max),
    'correct', v_correct,
    'wrong', v_wrong,
    'unanswered', v_skipped);

  update public.quiz_attempts
  set submitted_at = now(),
      responses    = v_stored,
      verdicts     = v_verdicts,
      result       = v_result
  where id = p_attempt_id and user_id = auth.uid();

  return public.get_quiz_attempt(p_attempt_id);
end;
$$;

grant execute on function public.get_quiz_attempt(uuid) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
commit;