create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  source_type text not null,
  content_hash text not null,
  storage_path text not null,
  chunk_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, content_hash)
);

alter table public.documents
  add column if not exists chunk_count integer not null default 0;

create table if not exists public.chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  page integer,
  section text,
  author text,
  recorded_at text,
  search_vector tsvector generated always as (
    to_tsvector('english'::regconfig, coalesce(content, ''))
  ) stored
);

create index if not exists chunks_search_vector_idx
  on public.chunks using gin (search_vector);
create index if not exists chunks_owner_id_idx on public.chunks(owner_id);
create index if not exists chunks_document_id_idx on public.chunks(document_id);

create table if not exists public.answer_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  normalized_question text not null,
  answer text not null,
  citations jsonb not null default '[]'::jsonb,
  mode text not null,
  notice text,
  abstained boolean not null default false,
  corpus_fingerprint text not null,
  asked_at timestamptz not null default now()
);

create index if not exists answer_history_owner_date_idx
  on public.answer_history(owner_id, asked_at desc);
create index if not exists answer_history_corpus_idx
  on public.answer_history(owner_id, corpus_fingerprint, asked_at desc);

alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.answer_history enable row level security;

grant select, insert, update, delete on public.documents, public.chunks, public.answer_history to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "Users manage their documents" on public.documents;
create policy "Users manage their documents" on public.documents
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users manage their chunks" on public.chunks;
create policy "Users manage their chunks" on public.chunks
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users manage their answer history" on public.answer_history;
create policy "Users manage their answer history" on public.answer_history
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('organization-documents', 'organization-documents', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "Users manage their stored documents" on storage.objects;
create policy "Users manage their stored documents" on storage.objects
  for all to authenticated using (
    bucket_id = 'organization-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'organization-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.search_chunks(search_query text, match_count integer default 6)
returns table (
  id bigint,
  document_id uuid,
  filename text,
  source_type text,
  content text,
  page integer,
  section text,
  author text,
  recorded_at text,
  score real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.document_id,
    d.filename,
    d.source_type,
    c.content,
    c.page,
    c.section,
    c.author,
    c.recorded_at,
    ts_rank_cd(c.search_vector, websearch_to_tsquery('english', search_query)) as score
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where c.owner_id = (select auth.uid())
    and c.search_vector @@ websearch_to_tsquery('english', search_query)
  order by score desc, c.id desc
  limit least(greatest(match_count, 1), 12);
$$;

revoke all on function public.search_chunks(text, integer) from public;
grant execute on function public.search_chunks(text, integer) to authenticated;
