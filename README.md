# Northstar — Organizational Memory

Northstar is a private, source-grounded knowledge workspace. Sign in with
Google, upload team records, ask questions in everyday language, and trace
answers back to their source passages. It runs on Next.js, Auth.js, and Neon
Postgres; it does not use Supabase.

## Live links

- **Vercel deployment:** [org-knowledge-base-nine.vercel.app](https://org-knowledge-base-nine.vercel.app/)
- **GitHub repository:** [itsshristijha/org-knowledge-base](https://github.com/itsshristijha/org-knowledge-base)
- **GitHub profile:** [github.com/itsshristijha](https://github.com/itsshristijha)

The current Vercel deployment needs Google OAuth and Neon environment variables
before sign-in and persistent storage can be activated.

## Features

- Google sign-in through Auth.js.
- Private PDF, DOCX, TXT, Markdown, CSV, and JSON uploads (4 MB per file).
- Source-linked answers with explicit abstention when retrieval finds no
  supporting passages.
- Optional OpenAI-compatible answer generation; evidence-only excerpts work
  without an AI key.
- Per-user question history and cautious similar-question reuse. A saved answer
  is reused only for a close match and the same indexed-document fingerprint.
- Document library, dated evidence timeline, discrepancy review, and handover
  brief.
- Each server-side data query is parameterized and scoped to the authenticated
  Google account. Uploaded file bytes, passages, and history are stored in
  Neon, never in a public file bucket.

The included demo set is fictional and intentionally contains an outdated
database-choice statement to demonstrate a source discrepancy.

## Deploy to Vercel

### 1. Create a Neon database

Create a Postgres project at [Neon](https://neon.tech/) or connect one through
the Vercel Marketplace. Copy its pooled connection string as `DATABASE_URL`.
The application creates its tables and indexes on first use; the equivalent
reviewable SQL is in [`database/schema.sql`](./database/schema.sql).

### 2. Configure Google OAuth

1. Create an OAuth 2.0 **Web application** client in
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add the authorized redirect URI
   `https://org-knowledge-base-nine.vercel.app/api/auth/callback/google`.
   For local development, also add
   `http://localhost:3000/api/auth/callback/google`.
3. Keep the client ID and secret private; add them to Vercel as
   `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

### 3. Configure Vercel

In the Vercel project settings, add these environment variables for Production,
Preview, and Development as appropriate:

| Variable | Required | Value |
| --- | --- | --- |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth client secret |
| `AUTH_SECRET` | Yes | Random secret used to sign Auth.js sessions |
| `AUTH_URL` | Yes | `https://org-knowledge-base-nine.vercel.app` |
| `DATABASE_URL` | Yes | Neon pooled Postgres connection string |
| `OPENAI_API_KEY` | No | Optional model answer generation |
| `OPENAI_BASE_URL` | No | Defaults to `https://api.openai.com/v1` |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |

Generate `AUTH_SECRET` with `openssl rand -base64 32`. Never commit credentials
or put secrets in `NEXT_PUBLIC_*` variables. Redeploy after setting the
variables, then use **Continue with Google**.

### 4. Run locally

Copy [`.env.example`](./.env.example) to `.env.local`, set the credentials and
database connection, then run:

```bash
npm install
npm run dev
```

The local app is at `http://localhost:3000`. Add its OAuth callback URI to the
Google OAuth client.

## Data handling and privacy

- Auth.js validates Google sign-in and stores sessions in signed JWT cookies.
- Neon is the system of record for user documents, searchable passages, and
  question history. The Vercel function filesystem is not used for durable
  user data.
- User IDs are derived from the authenticated Google account on the server;
  API callers cannot choose an owner ID. Every read and mutation is scoped to
  that owner, and SQL values are parameterized.
- Uploaded source files are stored as private Postgres `bytea` data and are
  never returned by an API or exposed through public URLs.
- Similar-answer reuse is disabled when the user's visible document set
  changes. Answers without supporting evidence are not cache hits.
- When `OPENAI_API_KEY` is set, the question and selected source excerpts are
  sent to the configured model endpoint. Review your organization's data policy
  before enabling external generation for sensitive records.
- The `data/demo/` documents are synthetic. No local PDFs, transcripts, Slack
  exports, databases, credentials, or uploaded files belong in the public repo.

## Tests and checks

```bash
npm test
npm run typecheck
npm run build
```

Tests cover supported-format parsing, invalid uploads, chunk boundaries,
question-similarity safety, corpus fingerprints, evidence citations, and date
extraction. The build check validates the Next.js Vercel deployment bundle.
