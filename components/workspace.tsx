"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ABSTENTION, type Answer, type Citation } from "@/lib/knowledge";

type DocumentItem = {
  id: string;
  filename: string;
  source_type: string;
  created_at: string;
  chunk_count: number;
};

type HistoryItem = {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  mode: Answer["mode"];
  notice: string | null;
  abstained: boolean;
  asked_at: string;
};

type WorkspaceProps = { userEmail: string };
type Tab = "ask" | "documents" | "timeline" | "discrepancies" | "handover";

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

export function Workspace({ userEmail }: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<Tab>("ask");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [question, setQuestion] = useState("");
  const [latestAnswer, setLatestAnswer] = useState<Answer | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [analysisTopic, setAnalysisTopic] = useState("payments pilot database");
  const [handoverProject, setHandoverProject] = useState("payments pilot");

  const refresh = useCallback(async () => {
    const [documentsResponse, historyResponse] = await Promise.all([
      fetch("/api/documents", { cache: "no-store" }),
      fetch("/api/history", { cache: "no-store" }),
    ]);
    const documentData = await readApiResponse<{
      documents: DocumentItem[];
      chunks: number;
      questions: number;
    }>(documentsResponse);
    const historyData = await readApiResponse<{ history: HistoryItem[] }>(historyResponse);
    setDocuments(documentData.documents);
    setChunkCount(documentData.chunks);
    setQuestionCount(documentData.questions);
    setHistory(historyData.history);
  }, []);

  useEffect(() => {
    refresh().catch((error: unknown) =>
      setErrorMessage(error instanceof Error ? error.message : "Could not load your workspace."),
    );
  }, [refresh]);

  const runQuestion = useCallback(async (text: string) => {
    setBusy(true);
    setErrorMessage("");
    setMessage("");
    setActiveTab("ask");
    setQuestion(text);
    try {
      const result = await readApiResponse<Answer>(await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      }));
      setLatestAnswer(result);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  async function uploadSelectedFiles() {
    if (!uploadFiles.length) return;
    setBusy(true);
    setErrorMessage("");
    setMessage("");
    let indexed = 0;
    let duplicates = 0;
    try {
      for (const file of uploadFiles) {
        if (file.size > 4 * 1024 * 1024) throw new Error(`${file.name} exceeds the 4 MB limit.`);
        const form = new FormData();
        form.set("file", file, file.name);
        const outcome = await readApiResponse<{ status: string }>(await fetch("/api/documents", {
          method: "POST",
          body: form,
        }));
        if (outcome.status === "duplicate") duplicates++;
        else indexed++;
      }
      setMessage(`${indexed} document${indexed === 1 ? "" : "s"} indexed${duplicates ? ` · ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : ""}.`);
      setUploadFiles([]);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadDemo() {
    setBusy(true);
    setErrorMessage("");
    setMessage("");
    try {
      const result = await readApiResponse<{ indexed: number; duplicates: number }>(
        await fetch("/api/demo", { method: "POST" }),
      );
      setMessage(`${result.indexed} fictional sample document${result.indexed === 1 ? "" : "s"} added · ${result.duplicates} already present.`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load demo documents.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(document: DocumentItem) {
    setBusy(true);
    setErrorMessage("");
    try {
      await readApiResponse(await fetch(`/api/documents/${document.id}`, { method: "DELETE" }));
      setMessage(`${document.filename} removed from your library.`);
      if (latestAnswer?.citations.some((citation) => citation.document_id === document.id)) {
        setLatestAnswer(null);
      }
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not remove the document.");
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    setBusy(true);
    setErrorMessage("");
    try {
      await readApiResponse(await fetch("/api/history", { method: "DELETE" }));
      setHistory([]);
      setLatestAnswer(null);
      setMessage("Your question history was cleared.");
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not clear question history.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setErrorMessage("");
    try {
      const csrfPayload = await readApiResponse<{ csrfToken: string }>(await fetch("/api/auth/csrf"));
      await readApiResponse<{ url: string }>(await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken: csrfPayload.csrfToken }),
      }));
      window.location.assign("/");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not sign out. Please try again.");
    }
  }

  const latestTimeline = useMemo(() => latestAnswer?.timeline ?? [], [latestAnswer]);
  const discrepancies = useMemo(
    () => findDiscrepancies(latestAnswer?.citations ?? []),
    [latestAnswer],
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="/" aria-label="Northstar home">
          <span className="brand-mark">N</span><span>northstar</span>
        </a>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace navigation">
          <button className={activeTab === "ask" ? "nav-item selected" : "nav-item"} onClick={() => setActiveTab("ask")}><span>⌕</span> Ask knowledge</button>
          <button className={activeTab === "documents" ? "nav-item selected" : "nav-item"} onClick={() => setActiveTab("documents")}><span>▤</span> Document library <small>{documents.length}</small></button>
          <button className={activeTab === "timeline" ? "nav-item selected" : "nav-item"} onClick={() => setActiveTab("timeline")}><span>◷</span> Decision timeline</button>
          <button className={activeTab === "discrepancies" ? "nav-item selected" : "nav-item"} onClick={() => setActiveTab("discrepancies")}><span>⌁</span> Discrepancies</button>
          <button className={activeTab === "handover" ? "nav-item selected" : "nav-item"} onClick={() => setActiveTab("handover")}><span>↗</span> Handover brief</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-library">
          <div className="library-icon">✳</div>
          <strong>Your knowledge, private.</strong>
          <p>Documents and answers are only visible to your account.</p>
          <button className="button button-small" onClick={() => setActiveTab("documents")}>Manage documents <span>→</span></button>
        </div>
        <div className="profile">
          <div className="avatar">{userEmail.slice(0, 1).toUpperCase()}</div>
          <div className="profile-copy"><strong>{userEmail.split("@")[0]}</strong><span>{userEmail}</span></div>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{tabTitle(activeTab)}</strong></div>
          <div className="topbar-actions">
            <div className="secure-label"><span /> PRIVATE WORKSPACE</div>
            <button className="button button-small header-signout" type="button" onClick={signOut}>
              <span aria-hidden="true">↗</span> Sign out
            </button>
          </div>
        </header>
        <div className="content-area">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">TEAM KNOWLEDGE · MADE SEARCHABLE</p>
              <h1>{activeTab === "ask" ? "A clearer view of what your team knows." : tabTitle(activeTab)}</h1>
              <p className="page-description">Find the reasoning behind decisions, trace answers back to sources, and make handovers easier to trust.</p>
            </div>
            <div className="welcome-symbol">✳</div>
          </div>

          <div className="metric-grid">
            <Metric label="Your documents" value={documents.length} icon="▤" detail="Private to you" />
            <Metric label="Searchable passages" value={chunkCount} icon="⌕" detail="Source-linked" />
            <Metric label="Questions saved" value={questionCount} icon="◷" detail="Personal history" />
          </div>

          {(message || errorMessage) && (
            <div className={errorMessage ? "notice notice-error" : "notice notice-success"} role="status">
              <span>{errorMessage ? "!" : "✓"}</span>{errorMessage || message}
              <button aria-label="Dismiss" onClick={() => { setMessage(""); setErrorMessage(""); }}>×</button>
            </div>
          )}

          {activeTab === "ask" && (
            <div className="ask-layout">
              <section className="panel ask-panel">
                <div className="panel-heading"><div><span className="panel-kicker">SEARCH YOUR SOURCES</span><h2>What would you like to know?</h2></div><span className="sparkle">✳</span></div>
                <form className="ask-form" onSubmit={(event) => { event.preventDefault(); if (question.trim()) void runQuestion(question.trim()); }}>
                  <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={3} placeholder="Ask about a decision, project, incident, or team handover…" aria-label="Your question" />
                  <div className="ask-form-footer"><span>Answers are grounded in your indexed documents.</span><button className="button button-primary" disabled={busy || !question.trim()}>{busy ? <><span className="spinner" /> Searching</> : <>Search knowledge <span>→</span></>}</button></div>
                </form>
                <div className="suggestion-label">TRY ASKING</div>
                <div className="suggestions">
                  {[
                    "Which database was selected for the Payments Pilot?",
                    "What is the current rollout status?",
                    "What is the approved annual compensation budget?",
                  ].map((suggestion) => <button key={suggestion} onClick={() => void runQuestion(suggestion)}>{suggestion}<span>↗</span></button>)}
                </div>
              </section>
              <aside className="panel side-note">
                <div className="note-icon">◈</div><span className="panel-kicker">BUILT FOR TRUST</span>
                <h3>Every answer leads back to evidence.</h3>
                <p>See the exact passages, filenames, and dates behind each response. If your sources don’t support an answer, Northstar says so.</p>
                <div className="note-rule" /><p className="note-foot">Your private library · Your history · Your control</p>
              </aside>
              {latestAnswer && <AnswerCard answer={latestAnswer} question={question} />}
              {history.length > 0 && (
                <section className="panel recent-panel">
                  <div className="section-heading"><div><span className="panel-kicker">PICK UP WHERE YOU LEFT OFF</span><h2>Recent questions</h2></div><button className="text-button" onClick={() => setActiveTab("documents")}>Your library <span>→</span></button></div>
                  {history.slice(0, 4).map((item) => (
                    <button className="recent-question" key={item.id} onClick={() => void runQuestion(item.question)}>
                      <span className="recent-question-icon">↳</span><span><strong>{item.question}</strong><small>{formatDate(item.asked_at)}</small></span><span className="recent-arrow">↗</span>
                    </button>
                  ))}
                </section>
              )}
            </div>
          )}

          {activeTab === "documents" && (
            <div className="document-layout">
              <section className="panel upload-panel">
                <div className="section-heading"><div><span className="panel-kicker">ADD TO YOUR PRIVATE LIBRARY</span><h2>Bring your team knowledge together.</h2></div><span className="upload-symbol">↥</span></div>
                <p className="muted">Upload PDF, DOCX, text, Markdown, CSV, or JSON files. Each file can be up to 4 MB.</p>
                <label className="dropzone">
                  <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.json" onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))} />
                  <span className="dropzone-icon">＋</span><strong>Choose files to upload</strong><span>or drag and drop them here</span>
                </label>
                {uploadFiles.length > 0 && <div className="selected-files">{uploadFiles.map((file) => <span key={`${file.name}-${file.size}`}>▤ {file.name} <small>{formatBytes(file.size)}</small></span>)}</div>}
                <div className="upload-actions"><button className="button button-primary" disabled={busy || uploadFiles.length === 0} onClick={() => void uploadSelectedFiles()}>{busy ? "Processing…" : `Index ${uploadFiles.length || ""} selected file${uploadFiles.length === 1 ? "" : "s"}`}</button><button className="button" disabled={busy} onClick={() => void loadDemo()}>Load fictional demo set</button></div>
                <p className="fine-print">Documents and their searchable passages are stored privately in your Neon database.</p>
              </section>
              <section className="panel document-panel">
                <div className="section-heading"><div><span className="panel-kicker">YOUR SOURCES</span><h2>Document library <span className="count-pill">{documents.length}</span></h2></div><button className="icon-button" aria-label="Refresh documents" onClick={() => void refresh()}>↻</button></div>
                {documents.length ? <div className="document-list">{documents.map((document) => <article className="document-row" key={document.id}>
                  <div className="file-type">{document.source_type.slice(0, 3)}</div><div className="document-info"><strong>{document.filename}</strong><span>{document.source_type} · {document.chunk_count} searchable passages · added {formatDate(document.created_at)}</span></div><button className="remove-button" disabled={busy} onClick={() => void removeDocument(document)}>Remove</button>
                </article>)}</div> : <EmptyState title="Your library is ready." copy="Add a few documents or load the fictional demo set to try source-grounded search." />}
              </section>
            </div>
          )}

          {activeTab === "timeline" && (
            <section className="panel full-panel"><div className="section-heading"><div><span className="panel-kicker">SOURCE-DATED EVENTS</span><h2>Decision timeline</h2></div></div>
              {latestTimeline.length ? <div className="timeline">{latestTimeline.map((item, index) => <article className="timeline-item" key={`${item.citation_id}-${index}`}><div className="timeline-dot" /><time>{item.date}</time><div><strong>{item.source} · [{item.citation_id}]</strong><p>{item.detail}</p></div></article>)}</div> : <EmptyState title="Your timeline will take shape as you ask." copy="Ask a question that finds dated source evidence, and the relevant events will appear here." />}
            </section>
          )}

          {activeTab === "discrepancies" && (
            <section className="panel full-panel"><div className="section-heading"><div><span className="panel-kicker">COMPARE DOCUMENTED FACTS</span><h2>Find potential discrepancies</h2></div></div>
              <form className="inline-search" onSubmit={(event) => { event.preventDefault(); void runQuestion(analysisTopic); }}><input value={analysisTopic} onChange={(event) => setAnalysisTopic(event.target.value)} aria-label="Topic to compare" /><button className="button button-primary" disabled={busy}>Compare sources</button></form>
              {latestAnswer && <div className="analysis-result"><p>{discrepancies.length ? "Different explicit values were found in your sources. Review the records below before acting." : latestAnswer.abstained ? ABSTENTION : "No explicitly labeled conflicting values were detected in the retrieved evidence."}</p>{discrepancies.map((item) => <article className="conflict-item" key={item.key}><strong>{item.key}</strong><div>{item.statements.map((statement) => <p key={`${statement.filename}-${statement.value}`}><b>{statement.filename}</b> [{statement.citation_id}]: {statement.value}</p>)}</div></article>)}<CitationList citations={latestAnswer.citations} /></div>}
            </section>
          )}

          {activeTab === "handover" && (
            <section className="panel full-panel"><div className="section-heading"><div><span className="panel-kicker">SOURCE-LINKED TRANSFER</span><h2>Build a handover brief</h2></div></div>
              <form className="inline-search" onSubmit={(event) => { event.preventDefault(); void runQuestion(`${handoverProject} handover status decisions risks owners and next steps`); }}><input value={handoverProject} onChange={(event) => setHandoverProject(event.target.value)} aria-label="Project or team" /><button className="button button-primary" disabled={busy}>Build brief</button></form>
              {latestAnswer && <div className="handover-result"><div className="handover-status"><span>PROJECT BRIEF</span><strong>{handoverProject}</strong><small>{latestAnswer.abstained ? "Limited source evidence" : `${latestAnswer.citations.length} linked source${latestAnswer.citations.length === 1 ? "" : "s"}`}</small></div><div><h3>Documented context</h3><p>{latestAnswer.answer}</p><CitationList citations={latestAnswer.citations} /></div></div>}
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, icon, detail }: { label: string; value: number; icon: string; detail: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><strong>{value.toLocaleString()}</strong><small><span />{detail}</small></article>;
}

function AnswerCard({ answer, question }: { answer: Answer; question: string }) {
  return <section className="panel answer-card"><div className="section-heading"><div><span className="panel-kicker">YOUR ANSWER</span><h2>{question}</h2></div><span className={answer.cached ? "answer-badge badge-cached" : "answer-badge"}>{answer.cached ? "↻ REUSED" : answer.abstained ? "EVIDENCE GAP" : "SOURCE-VERIFIED"}</span></div>
    {answer.cached && <p className="cache-note">Reused your saved answer to “{answer.original_question}” · {answer.cached_at ? formatDate(answer.cached_at) : "previously saved"} · Your documents haven’t changed.</p>}
    <div className={answer.abstained ? "answer-copy abstention" : "answer-copy"}>{answer.answer}</div>
    {answer.mode === "evidence-only" && <p className="answer-mode">Evidence-only response · exact source passages, no generated summary</p>}
    {answer.mode === "model" && <p className="answer-mode">Model-generated response · review the source passages below</p>}
    {answer.notice && <p className="notice notice-warn">{answer.notice}</p>}
    <CitationList citations={answer.citations} />
  </section>;
}

function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return <details className="citations"><summary>Sources and evidence <span>{citations.length} source{citations.length === 1 ? "" : "s"}</span></summary><div className="citation-list">{citations.map((citation) => <article key={citation.id}><div><b>[{citation.id}] {citation.filename}</b><span>{[citation.page ? `page ${citation.page}` : "", citation.section, citation.source_type].filter(Boolean).join(" · ")}</span></div><p>{citation.snippet}</p></article>)}</div></details>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>✳</span><strong>{title}</strong><p>{copy}</p></div>;
}

function tabTitle(tab: Tab) {
  return {
    ask: "Ask knowledge",
    documents: "Document library",
    timeline: "Decision timeline",
    discrepancies: "Discrepancies",
    handover: "Handover brief",
  }[tab];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formatBytes(value: number) {
  return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function findDiscrepancies(citations: Citation[]) {
  const patterns = [
    /(?:database choice|database selected|database decision)\s*:\s*([^.]+)/i,
    /(?:status)\s*:\s*([^.]+)/i,
    /(?:retention period)\s*:\s*([^.]+)/i,
  ];
  const values = new Map<string, Array<{ filename: string; value: string; citation_id: string }>>();
  for (const citation of citations) {
    for (const pattern of patterns) {
      const match = citation.snippet.match(pattern);
      if (!match) continue;
      const key = pattern.source.includes("database") ? "database choice" : pattern.source.includes("status") ? "status" : "retention period";
      const statement = { filename: citation.filename, value: match[1].trim(), citation_id: citation.id };
      const existing = values.get(key) ?? [];
      if (!existing.some((item) => item.value.toLowerCase() === statement.value.toLowerCase())) existing.push(statement);
      values.set(key, existing);
    }
  }
  return [...values.entries()]
    .filter(([, statements]) => statements.length > 1)
    .map(([key, statements]) => ({ key, statements }));
}
