-- Additive private document library. Review/test locally before deployment.
begin;
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  filename text not null check (length(filename) between 1 and 255),
  storage_path text generated always as (user_id::text || '/' || id::text || '/source.pdf') stored unique,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  status text not null default 'queued' check (status in ('queued','processing','ready','incomplete','failed','deleting')),
  processing_token uuid,
  processing_started_at timestamptz,
  processing_error text check (length(processing_error) <= 200),
  page_count integer check (page_count between 1 and 200),
  missing_text_pages integer[] not null default '{}',
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (id, user_id)
);
create index documents_owner_created on public.documents(user_id, created_at desc);
alter table public.documents enable row level security;
create policy documents_owner on public.documents for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.documents from anon;
grant select, insert, update, delete on public.documents to authenticated;

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  user_id uuid not null default auth.uid(),
  chunk_index integer not null check (chunk_index between 0 and 799),
  page_number integer not null check (page_number between 1 and 200),
  content text not null check (length(content) between 1 and 1000),
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  foreign key (document_id, user_id) references public.documents(id, user_id) on delete cascade,
  unique (document_id, chunk_index)
);
create index document_chunks_fts on public.document_chunks using gin(content_tsv);
create index document_chunks_owner on public.document_chunks(user_id, document_id);
alter table public.document_chunks enable row level security;
create policy document_chunks_owner on public.document_chunks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.document_chunks from anon;
grant select, insert, delete on public.document_chunks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf']);
create policy documents_storage_read on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy documents_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.documents d where d.storage_path = name and d.user_id = auth.uid() and d.status = 'queued')
);
create policy documents_storage_delete on storage.objects for delete to authenticated using (
  bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text
);
-- No UPDATE policy: source objects cannot be overwritten.

create function public.claim_document(p_document_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare token uuid := gen_random_uuid();
begin
  update public.documents set status = 'processing', processing_token = token,
    processing_started_at = now(), processing_error = null
  where id = p_document_id and user_id = auth.uid()
    and (status in ('queued','failed') or (status = 'processing' and processing_started_at < now() - interval '5 minutes'));
  if not found then return null; end if;
  return token;
end;
$$;

create function public.search_documents(p_query text)
returns table (document_id uuid, filename text, page_number integer, content text, chunk_id uuid)
language sql stable security invoker set search_path = public as $$
  select d.id, d.filename, c.page_number, c.content, c.id
  from public.document_chunks c join public.documents d on d.id = c.document_id
  where d.user_id = auth.uid() and c.user_id = auth.uid()
    and d.status in ('ready','incomplete')
    and c.content_tsv @@ websearch_to_tsquery('english', left(p_query, 500))
  order by ts_rank(c.content_tsv, websearch_to_tsquery('english', left(p_query, 500))) desc, c.id
  limit 8;
$$;
revoke all on function public.claim_document(uuid), public.search_documents(text) from public, anon;
grant execute on function public.claim_document(uuid), public.search_documents(text) to authenticated;


create function public.complete_document(p_document_id uuid, p_token uuid, p_pages integer, p_missing integer[], p_chunks jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.documents where id = p_document_id and user_id = auth.uid()
    and status = 'processing' and processing_token = p_token for update;
  if not found then raise exception 'document_lease_lost'; end if;
  if p_pages is null or p_pages not between 1 and 200 or p_missing is null
    or exists (select 1 from unnest(p_missing) n where n is null or n < 1 or n > p_pages)
    or p_chunks is null or jsonb_typeof(p_chunks) <> 'array'
    or jsonb_array_length(p_chunks) not between 1 and 800 then
    raise exception 'invalid_extraction';
  end if;
  delete from public.document_chunks where document_id = p_document_id and user_id = auth.uid();
  insert into public.document_chunks(document_id, user_id, chunk_index, page_number, content)
    select p_document_id, auth.uid(), (ord - 1)::integer, (item->>'page_number')::integer, item->>'content'
    from jsonb_array_elements(p_chunks) with ordinality as x(item, ord);
  if exists (select 1 from public.document_chunks where document_id = p_document_id
    and (page_number > p_pages or page_number = any(p_missing))) then
    raise exception 'invalid_source_page';
  end if;
  update public.documents set status = case when cardinality(p_missing) > 0 then 'incomplete' else 'ready' end,
    page_count = p_pages, missing_text_pages = p_missing, processed_at = now(),
    processing_token = null, processing_error = null
  where id = p_document_id and user_id = auth.uid();
end;
$$;
revoke all on function public.complete_document(uuid, uuid, integer, integer[], jsonb) from public, anon;
grant execute on function public.complete_document(uuid, uuid, integer, integer[], jsonb) to authenticated;
commit;
