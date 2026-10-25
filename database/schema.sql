-- These tables are created automatically by the application on first use.
-- This file is provided for review or manual database setup.
create table if not exists public.documents (
  id uuid primary key,
  owner_id text not null,
  filename text not null,
  source_type text not null,
  content_hash text not null,
  file_data bytea not null,
  created_at timestamptz not null default now(),
  unique (owner_id, content_hash)
);

create table if not exists public.chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id text not null,
  content text not null,
  page integer,
  section text,
  author text,
  recorded_at text
);

create table if not exists public.answer_history (
  id uuid primary key,
  owner_id text not null,
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

create index if not exists documents_owner_idx on public.documents(owner_id);
create index if not exists chunks_owner_idx on public.chunks(owner_id);
create index if not exists chunks_search_idx
  on public.chunks using gin (to_tsvector('english', content));
create index if not exists answer_history_owner_date_idx
  on public.answer_history(owner_id, asked_at desc);
create index if not exists answer_history_corpus_idx
  on public.answer_history(owner_id, corpus_fingerprint, asked_at desc);
