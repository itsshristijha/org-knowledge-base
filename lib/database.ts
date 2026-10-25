import { neon } from "@neondatabase/serverless";

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Neon is not configured yet. Add DATABASE_URL to the Vercel project.");
  }
  return neon(connectionString);
}

export async function ensureSchema() {
  const sql = getDatabase();
  await sql`
    create table if not exists public.documents (
      id uuid primary key,
      owner_id text not null,
      filename text not null,
      source_type text not null,
      content_hash text not null,
      file_data bytea not null,
      created_at timestamptz not null default now(),
      unique (owner_id, content_hash)
    )
  `;
  await sql`
    create table if not exists public.chunks (
      id bigint generated always as identity primary key,
      document_id uuid not null references public.documents(id) on delete cascade,
      owner_id text not null,
      content text not null,
      page integer,
      section text,
      author text,
      recorded_at text
    )
  `;
  await sql`
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
    )
  `;
  await sql`create index if not exists documents_owner_idx on public.documents(owner_id)`;
  await sql`create index if not exists chunks_owner_idx on public.chunks(owner_id)`;
  await sql`create index if not exists chunks_search_idx on public.chunks using gin (to_tsvector('english', content))`;
  await sql`create index if not exists answer_history_owner_date_idx on public.answer_history(owner_id, asked_at desc)`;
  await sql`create index if not exists answer_history_corpus_idx on public.answer_history(owner_id, corpus_fingerprint, asked_at desc)`;
}
