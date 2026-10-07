create or replace function public.retrieve_attachment_chunks(
  p_conversation_id uuid,
  p_query text,
  p_query_embedding vector(1536),
  p_limit int default 10
)
returns table (
  chunk_id uuid,
  attachment_id uuid,
  chunk_index int,
  page_number int,
  content text,
  label text,
  similarity float,
  retrieval_method text,
  filename text,
  mime_type text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_member uuid;
  v_has_embeddings boolean;
  v_limit int;
  v_fts_query tsquery;
  v_relaxed_query text;
begin
  select user_id into v_member
  from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id = auth.uid();
  if v_member is null then
    return;
  end if;

  if p_query is null or btrim(p_query) = '' then
    return;
  end if;

  v_limit := least(coalesce(p_limit, 10), 50);

  select exists (
    select 1
    from public.attachment_chunks ac
    join public.message_attachments ma on ma.id = ac.attachment_id
    join public.messages m on m.id = ma.message_id
    where m.conversation_id = p_conversation_id
      and ac.embedding is not null
  ) into v_has_embeddings;

  create temp table if not exists _v3_retrieval_legs (
    chunk_id uuid, attachment_id uuid, chunk_index int, page_number int,
    content text, label text, similarity float, retrieval_method text,
    filename text, mime_type text, vec_rank int, fts_rank int
  ) on commit drop;
  delete from pg_temp._v3_retrieval_legs;

  if v_has_embeddings and p_query_embedding is not null then
    insert into pg_temp._v3_retrieval_legs
    select
      ac.id, ac.attachment_id, ac.chunk_index, ac.page_number,
      ac.content, ac.label,
      1 - (ac.embedding <=> p_query_embedding),
      'vector',
      ma.storage_path,
      ma.mime_type,
      row_number() over (order by ac.embedding <=> p_query_embedding),
      null
    from public.attachment_chunks ac
    join public.message_attachments ma on ma.id = ac.attachment_id
    join public.messages m on m.id = ma.message_id
    where m.conversation_id = p_conversation_id
      and ac.embedding is not null
    order by ac.embedding <=> p_query_embedding
    limit v_limit;
  end if;

  v_fts_query := websearch_to_tsquery('english', p_query);

  insert into pg_temp._v3_retrieval_legs
  select
    ac.id, ac.attachment_id, ac.chunk_index, ac.page_number,
    ac.content, ac.label,
    ts_rank(ac.content_tsv, v_fts_query),
    'fts',
    ma.storage_path,
    ma.mime_type,
    null,
    row_number() over (order by ts_rank(ac.content_tsv, v_fts_query) desc)
  from public.attachment_chunks ac
  join public.message_attachments ma on ma.id = ac.attachment_id
  join public.messages m on m.id = ma.message_id
  where m.conversation_id = p_conversation_id
    and ac.content_tsv @@ v_fts_query
  order by ts_rank(ac.content_tsv, v_fts_query) desc
  limit v_limit;

  if not exists (
    select 1 from pg_temp._v3_retrieval_legs where fts_rank is not null
  ) then
    select string_agg('"' || term || '"', ' OR ' order by first_position)
    into v_relaxed_query
    from (
      select lower(term) as term, min(position) as first_position
      from regexp_split_to_table(p_query, '[^[:alnum:]]+') with ordinality as words(term, position)
      where length(term) >= 3
        and to_tsvector('english', term) <> ''::tsvector
      group by lower(term)
      order by min(position)
      limit 12
    ) meaningful_terms;

    if v_relaxed_query is not null then
      v_fts_query := websearch_to_tsquery('english', v_relaxed_query);

      insert into pg_temp._v3_retrieval_legs
      select
        ac.id, ac.attachment_id, ac.chunk_index, ac.page_number,
        ac.content, ac.label,
        ts_rank(ac.content_tsv, v_fts_query),
        'fts',
        ma.storage_path,
        ma.mime_type,
        null,
        row_number() over (order by ts_rank(ac.content_tsv, v_fts_query) desc)
      from public.attachment_chunks ac
      join public.message_attachments ma on ma.id = ac.attachment_id
      join public.messages m on m.id = ma.message_id
      where m.conversation_id = p_conversation_id
        and ac.content_tsv @@ v_fts_query
      order by ts_rank(ac.content_tsv, v_fts_query) desc
      limit v_limit;
    end if;
  end if;

  return query
  with merged as (
    select
      leg.chunk_id, leg.attachment_id, leg.chunk_index, leg.page_number,
      leg.content, leg.label,
      leg.similarity,
      case
        when leg.vec_rank is not null and leg.fts_rank is not null then 'hybrid'
        else leg.retrieval_method
      end as method,
      leg.filename, leg.mime_type,
      coalesce(leg.vec_rank, 2147483647) as vr,
      coalesce(leg.fts_rank, 2147483647) as fr
    from pg_temp._v3_retrieval_legs leg
  ),
  fused as (
    select
      m.*,
      case
        when m.vr < 2147483647 and m.fr < 2147483647
          then 1.0 / (60 + m.vr) + 1.0 / (60 + m.fr)
        when m.vr < 2147483647 then 1.0 / (60 + m.vr)
        else 1.0 / (60 + m.fr)
      end as rrf
    from merged m
  )
  select
    f.chunk_id, f.attachment_id, f.chunk_index, f.page_number,
    f.content, f.label, f.similarity, f.method,
    split_part(f.filename, '/', 3) as filename,
    f.mime_type
  from fused f
  order by f.rrf desc, f.chunk_id
  limit v_limit;
end;
$$;

grant execute on function public.retrieve_attachment_chunks(uuid, text, vector(1536), int) to authenticated;
