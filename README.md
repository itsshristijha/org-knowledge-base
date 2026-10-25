# Organizational Memory

A small, local-first application for searching team documents, tracing dated
decisions, comparing explicitly labeled facts, and preparing a source-linked
handover. The included demo documents describe a fictional company and contain
one intentional database-choice discrepancy.

## What it does

- Ingests PDF, DOCX, TXT, Markdown, CSV, and JSON files.
- Extracts page numbers from PDFs, headings from Markdown/text, and author/date
  metadata from JSON message records.
- Splits extracted text into overlapping chunks while retaining source
  filename and available page/section/author/date metadata.
- Stores the document library, chunks, query counts, and optional embedding
  vectors in a local SQLite database.
- Retrieves evidence with a local TF-IDF vector similarity score combined with
  a BM25-style lexical score. If configured, OpenAI-compatible embeddings add a
  semantic vector signal to that hybrid rank.
- Uses an optional OpenAI-compatible chat model to synthesize answers from
  retrieved evidence. Without a model key, it returns source excerpts directly
  and labels the response **evidence-only**; it does not invent an answer.
- Displays source IDs, exact retrieved excerpts, file names, available page or
  section, and relevance scores with every supported answer.
- Abstains with the exact response
  “I couldn't find enough evidence in the available documents to answer this
  reliably.” when no retrieved passage meets the relevance threshold.
- Includes an explicit-label discrepancy detector and a structured handover
  view. The discrepancy detector is intentionally conservative and does not
  claim to detect every kind of contradiction.

## RAG and evidence behavior

1. The parser validates an allowed extension and file-size limit before
   extracting text. Unreadable or empty documents are reported as errors.
2. Content hashes prevent a byte-identical document from being indexed twice.
   Chunks and metadata are persisted in SQLite; uploaded source files are stored
   under `data/uploads/`.
3. The query is ranked against indexed chunks with BM25-style term matching and
   local TF-IDF cosine similarity. `RETRIEVAL_MIN_SCORE` (default `0.12`) sets
   the evidence gate. A low-scoring query returns the abstention response before
   any generation request.
4. If `OPENAI_API_KEY` is configured, the app sends the selected excerpts and
   question to the configured chat model. Source text is explicitly treated as
   untrusted data, not instructions. The app only accepts a model answer when
   it includes valid source markers such as `[S1]`; otherwise it shows the
   retrieved excerpts instead.
5. If no API key is configured, retrieval still works locally and answers are
   assembled from exact source excerpts. This is not presented as model
   generation. If an API call fails, the app shows a notice and uses the same
   evidence-only fallback.

The local TF-IDF method is lexical rather than a pretrained language embedding;
it is suitable for a small demo corpus, but synonyms and paraphrases may be
missed. Configure optional embeddings for a semantic vector signal. OpenAI
embeddings and chat generation transmit the query and selected document
excerpts to the configured endpoint and may incur provider charges. Do not use
confidential documents with an external provider unless the organization's
privacy policy permits it.

## Setup

Python 3.10 or newer is required (the workspace was checked with Python 3.14).

```bash
cd /path/to/org-knowledge-base
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp -n .env.example .env
streamlit run app.py
```

On Windows, activate the environment with `.venv\Scripts\activate`. The app
opens at the local URL printed by Streamlit, usually
`http://localhost:8501`.

## Publish and deploy

The repository is designed for **Streamlit Community Cloud**. Vercel does not
run a persistent Streamlit server, so this Streamlit version is not deployed
there. To publish it:

1. Create a new GitHub repository and push the project.
2. Open [share.streamlit.io](https://share.streamlit.io/) and sign in with
   GitHub.
3. Choose **Create app**, select the repository and `main` branch, and set the
   app entry point to `app.py`.
4. Add optional model credentials through **App settings → Secrets**, not by
   committing `.env`. Set `OPENAI_API_KEY` there only if model generation is
   desired.

Streamlit Community Cloud's local filesystem is not a durable database. The
included SQLite index and uploaded files can be lost when the app restarts or
rebuilds. Re-index the bundled demo files after a restart; use a managed
persistent database/object store before relying on uploaded knowledge in a
long-lived deployment.

The `.gitignore` deliberately excludes local `.env` files, the existing
non-demo documents/exports, uploaded files, and local indexes. Only the
fictional `data/demo/` set is intended for the public repository.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `data` | Root directory for input folders and the SQLite database |
| `MAX_UPLOAD_MB` | `10` | Maximum accepted upload size per file |
| `RETRIEVAL_MIN_SCORE` | `0.12` | Minimum hybrid retrieval score required to answer |
| `OPENAI_API_KEY` | unset | Enables optional model-generated answers |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `OPENAI_MODEL` | `gpt-4o-mini` | Chat completion model |
| `EMBEDDING_PROVIDER` | `local` | Use `openai` for optional remote embeddings |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model when enabled |

Keep `.env` private; it is excluded by `.gitignore`. Without `OPENAI_API_KEY`,
the application remains usable in local evidence-only mode.

## Load the demo documents

The fictional files are in `data/demo/`. Start the app, select **Load fictional
demo set** in the sidebar, then ask questions in the **Ask a question** tab.
This indexes only the synthetic sample files. **Index files in data folders**
also searches `data/docs/`, `data/transcripts/`,
`data/slack/`, `data/uploads/`, and `data/demo/`. Previously indexed content is
skipped by its content hash. The SQLite database is created at
`data/memory.sqlite3`.

The demo set includes a product brief, architecture meeting notes, ADR-014, an
incident record, and a handover note. It intentionally contains a stale
`Database choice: MongoDB` line in the handover that conflicts with the
accepted `Database choice: PostgreSQL` in ADR-014.

## Five demo questions

1. **“Which database was selected for the Payments Pilot?”** — Returns the
   relevant ADR and handover excerpts with source markers. The discrepancy view
   shows the conflicting labeled values.
2. **“What is the current rollout status?”** — Retrieves the handover's
   internal-validation status and states that production launch is not approved.
3. **“What issue occurred in the reconciliation test?”** — Cites the incident
   report and its resolution in the test environment.
4. **“What is the approved annual compensation budget?”** — Abstains
   because the demo documents do not contain that information.
5. **“What retention period was approved?”** — Abstains or reports that it
   remains undocumented, depending on the retrieved evidence; the records say
   it is still a follow-up, not an approved value.

## Tests

Run the standard-library test suite from the project root:

```bash
python -m unittest discover -s tests -v
```

Tests cover text/CSV/JSON parsing, invalid files, evidence retrieval, citation
mapping, abstention, duplicate ingestion, discrepancy detection, handover
gaps, local model-error fallback, and database-backed metrics.

## Troubleshooting

- **“No readable text could be extracted”**: scanned/image-only PDFs need OCR,
  which is not currently included. Try a text-searchable PDF or DOCX/text copy.
- **PDF/DOCX support unavailable**: install the requirements in the same Python
  environment used to run Streamlit.
- **No answer or an abstention**: index the intended files and try a question
  using terms found in the source. For a small demo corpus, adjust
  `RETRIEVAL_MIN_SCORE` cautiously; lower thresholds can admit irrelevant
  evidence.
- **Model unavailable**: verify the endpoint and environment variables. The app
  will label its evidence-only fallback and continue to show source excerpts.
- **A removed source returns after re-indexing**: removal deletes an uploaded
  copy, but files under `data/docs/`, `data/transcripts/`, `data/slack/`, or
  `data/demo/` remain on disk and are re-imported when those folders are
  indexed again.
- **Need a clean local index**: stop the app, back up any useful local data, and
  remove only `data/memory.sqlite3` plus its `-wal`/`-shm` files. Re-index the
  source folders afterward.

## Architecture and limitations

- `app.py`: Streamlit UI, uploads, dashboard metrics, evidence display, timeline,
  discrepancy view, and handover.
- `rag_engine.py`: parsers, chunking, SQLite persistence, hybrid retrieval,
  optional OpenAI-compatible calls, citation mapping, abstention, and
  evidence-derived features.
- `data/demo/`: fictional, cross-referenced sample knowledge base.
- `tests/`: parser, retrieval, citation, abstention, conflict, and fallback
  checks.

This is a single-user local prototype, not a production multi-tenant service.
It has no authentication, authorization, encryption-at-rest policy, OCR,
advanced contradiction model, or query-level access controls. Protect the
workspace and any indexed records accordingly. Conflict detection only compares
different values under the same explicit `Key: Value` label in retrieved
evidence; it cannot reliably detect implicit or nuanced contradictions.

## Hackathon demo walkthrough

1. Start Streamlit and index the bundled demo files.
2. Ask which database was selected; expand sources to inspect the ADR and stale
   handover evidence.
3. Open **Find discrepancies** and compare the payments pilot database facts.
4. Ask for the reconciliation incident and inspect the cited incident report.
5. Ask for an office address to demonstrate abstention.
6. Generate a payments pilot handover and point out fields the sources do not
   document.
