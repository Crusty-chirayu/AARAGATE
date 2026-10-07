-- Quiz attempt creation and keyed snapshots are server-owned. The practice
-- generator authenticates the caller before using service_role to write them;
-- clients may only read their attempt through the answer-stripping RPC.
drop policy if exists quiz_attempts_insert_own on public.quiz_attempts;
revoke insert on public.quiz_attempts from authenticated;

drop policy if exists quiz_attempt_items_insert_own on public.quiz_attempt_items;
drop policy if exists quiz_attempt_items_delete_own on public.quiz_attempt_items;
revoke insert, delete on public.quiz_attempt_items from authenticated;

grant insert, delete on public.quiz_attempts to service_role;
grant insert, delete on public.quiz_attempt_items to service_role;

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

  if jsonb_typeof(p_response->'selected') <> 'array' then
    return jsonb_build_object('outcome', 'wrong', 'awarded', 0, 'max', v_max);
  end if;
  v_selected := p_response->'selected';
  if jsonb_array_length(v_selected) = 0 then
    return jsonb_build_object('outcome', 'unanswered', 'awarded', 0, 'max', v_max);
  end if;

  v_key := coalesce(p_question->'answer', '[]'::jsonb);

  if v_kind = 'MSQ' then
    v_correct := jsonb_array_length(v_selected) = jsonb_array_length(v_key)
      and (
        select count(distinct s.id) = jsonb_array_length(v_selected)
        from jsonb_array_elements_text(v_selected) as s(id)
      )
      and not exists (
        select 1 from jsonb_array_elements_text(v_selected) as s(id)
        where s.id not in (select k from jsonb_array_elements_text(v_key) as k(k))
      );
    return jsonb_build_object(
      'outcome', case when v_correct then 'correct' else 'wrong' end,
      'awarded', case when v_correct then v_max else 0 end,
      'max', v_max);
  end if;

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
