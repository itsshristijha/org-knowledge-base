# Northstar — Organizational Memory

Northstar is a private, source-grounded knowledge workspace. Sign in with
Google, upload team records, ask questions in everyday language, and trace
answers back to their source passages. The Vercel version is built with
Next.js; Supabase provides Google-backed authentication, PostgreSQL, row-level
security, and private document storage.

## Live links

- **Vercel deployment:** [org-knowledge-base-nine.vercel.app](https://org-knowledge-base-nine.vercel.app/)
- **GitHub repository:** [itsshristijha/org-knowledge-base](https://github.com/itsshristijha/org-knowledge-base)
- **GitHub profile:** [github.com/itsshristijha](https://github.com/itsshristijha)

The Vercel deployment is online. To activate Google sign-in, uploads, search,
and persistent history, first configure the Supabase environment variables and
Google provider using the steps below. Until configured, the deployment shows
a setup page and keeps the workspace closed.

## What it does

- Google sign-in through Supabase Auth.
- Private PDF, DOCX, TXT, Markdown, CSV, and JSON uploads (10 MB per file).
- Source-linked answers with explicit abstention when retrieval finds no
  supporting passages.
- Optional OpenAI-compatible answer generation; evidence-only excerpts work
  without an AI key.
- Private question history and cautious similar-question reuse. A saved answer
  is reused only for a close match and the same indexed-document fingerprint.
- Document library, dated evidence timeline, discrepancy review, and handover
  brief.
- Supabase row-level security scopes documents, chunks, answers, and stored
  files to the signed-in user.

The included demo set is fictional and intentionally contains an outdated
database-choice statement to demonstrate a source discrepancy.

## Deploy to Vercel

### 1. Create and configure Supabase

1. Create a Supabase project.
2. In **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql). This
   creates the tables, full-text search function, private Storage bucket, and
   row-level security policies used by the app.
3. In **Authentication → Providers → Google**, enable Google and add the
   OAuth client ID and secret from Google Cloud Console.
4. In Google Cloud Console, configure the OAuth web client redirect URI as
   `https://<your-project-ref>.supabase.co/auth/v1/callback` (shown by
   Supabase's Google provider setup).
5. In **Authentication → URL Configuration**, set the Site URL to your Vercel
   deployment and allow both
   `https://<your-vercel-domain>/auth/callback` and
   `http://localhost:3000/auth/callback`.
6. Copy the Supabase project URL and publishable/anon key from **Project
   Settings → API**. Do not use a service-role key in this app.

### 2. Import the GitHub project into Vercel

1. Sign in at [Vercel](https://vercel.com/) and choose **Add New → Project**.
2. Import [`itsshristijha/org-knowledge-base`](https://github.com/itsshristijha/org-knowledge-base).
3. Keep the detected **Next.js** framework and root directory at `./`.
   Vercel uses [`vercel.json`](./vercel.json) and the `npm run build` script.
4. Add these environment variables in the project settings for **Production,
   Preview, and Development**:

   | Variable | Required | Value |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase publishable/anon key |
   | `OPENAI_API_KEY` | No | Optional model answer generation |
   | `OPENAI_BASE_URL` | No | Defaults to `https://api.openai.com/v1` |
   | `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |

5. Deploy. Add the generated Vercel domain to the Supabase Auth Site URL and
   redirect allowlist, then redeploy if you changed environment variables.
6. Open the deployment URL and choose **Continue with Google**.

For local development, copy [`.env.example`](./.env.example) to `.env.local`,
fill in the Supabase URL and publishable key, then run:

```bash
npm install
npm run dev
```

The local app is at `http://localhost:3000`. Add that callback URL to the
Supabase Auth redirect allowlist.

## Data handling and privacy

- Supabase is the system of record for user documents, searchable passages,
  private uploaded files, and question history. The Vercel function filesystem
  is not used for durable user data.
- PostgreSQL row-level security is enabled by the provided schema. The app
  authenticates each request and never uses a Supabase service-role key.
- Similar-answer reuse is disabled when the visible document set changes.
  Answers without supporting evidence are not used as cache hits.
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
