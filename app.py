from __future__ import annotations

import hashlib
import os
from pathlib import Path

import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError

from rag_engine import (
    ABSTENTION,
    MAX_UPLOAD_BYTES,
    IngestionError,
    OrganizationalMemoryEngine,
    parse_file,
)

st.set_page_config(
    page_title="Organizational Memory",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded",
)

try:
    runtime_secrets = st.secrets.to_dict()
except StreamlitSecretNotFoundError:
    runtime_secrets = {}
for secret_name in (
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "EMBEDDING_PROVIDER",
    "EMBEDDING_MODEL",
    "DATA_DIR",
    "MAX_UPLOAD_MB",
    "RETRIEVAL_MIN_SCORE",
):
    if secret_name in runtime_secrets and secret_name not in os.environ:
        os.environ[secret_name] = str(runtime_secrets[secret_name])

st.markdown("""
<style>
    :root {
        --ink: #e8eef7;
        --muted: #91a0b4;
        --line: rgba(148, 163, 184, 0.16);
        --panel: rgba(17, 27, 43, 0.82);
        --accent: #76a9ff;
    }
    .stApp {
        background:
            radial-gradient(ellipse at 12% 0%, rgba(31, 78, 121, 0.26), transparent 34rem),
            linear-gradient(145deg, #0a101a 0%, #0c1421 46%, #0b111b 100%);
        color: var(--ink);
    }
    [data-testid="stMainBlockContainer"] {
        max-width: 1320px;
        padding-top: 2rem;
        padding-bottom: 4rem;
    }
    [data-testid="stSidebar"] {
        background: rgba(11, 18, 29, 0.96);
        border-right: 1px solid var(--line);
    }
    h1, h2, h3, h4 { color: #f4f7fb !important; letter-spacing: -0.025em; }
    h1 { font-size: clamp(2rem, 3.5vw, 3rem) !important; line-height: 1.12 !important; }
    [data-testid="stCaptionContainer"] { color: var(--muted); }
    [data-testid="stMetric"] {
        background: linear-gradient(145deg, rgba(20, 32, 50, 0.96), rgba(14, 23, 37, 0.9));
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 1rem 1.15rem;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
        min-height: 104px;
    }
    [data-testid="stMetricLabel"] { color: var(--muted); font-size: 0.86rem; }
    [data-testid="stMetricValue"] { color: #f2f6fc; font-weight: 650; }
    [data-baseweb="tab-list"] {
        gap: 0.35rem;
        border-bottom: 1px solid var(--line);
    }
    [data-baseweb="tab"] {
        border-radius: 9px 9px 0 0;
        padding: 0.6rem 0.9rem;
    }
    [aria-selected="true"][data-baseweb="tab"] {
        background: rgba(65, 112, 179, 0.14);
    }
    .stButton > button {
        border: 1px solid var(--line);
        border-radius: 9px;
        transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
    }
    .stButton > button:hover { border-color: rgba(118, 169, 255, 0.62); transform: translateY(-1px); }
    .stButton > button[kind="primary"] {
        color: #08111f;
        background: linear-gradient(110deg, #91bbff, #70a5fb);
        border: 0;
        font-weight: 650;
    }
    [data-testid="stTextInput"] input,
    [data-testid="stChatInput"] textarea {
        border-radius: 10px;
        border-color: var(--line);
    }
    [data-testid="stExpander"] {
        background: rgba(16, 26, 41, 0.68);
        border: 1px solid var(--line);
        border-radius: 12px;
    }
    [data-testid="stVerticalBlockBorderWrapper"] {
        background: var(--panel);
        border-color: var(--line);
        border-radius: 13px;
    }
    [data-testid="stAlert"] { border-radius: 10px; }
    .hero-kicker {
        color: #8eb7ff;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        margin-bottom: 0.4rem;
    }
    .hero-copy {
        color: #9cabc0;
        font-size: 1.03rem;
        max-width: 720px;
        margin-top: -0.5rem;
        margin-bottom: 1.5rem;
        line-height: 1.6;
    }
    @media (max-width: 700px) {
        [data-testid="stMainBlockContainer"] { padding: 1.1rem 0.8rem 3rem; }
        [data-testid="stMetric"] { padding: 0.8rem; min-height: 88px; }
        [data-baseweb="tab-list"] { gap: 0.05rem; }
        [data-baseweb="tab"] { padding: 0.5rem; }
    }
</style>
""", unsafe_allow_html=True)


@st.cache_resource
def get_engine() -> OrganizationalMemoryEngine:
    return OrganizationalMemoryEngine(os.getenv("DATA_DIR", "data"))


engine = get_engine()


def show_citations(citations: list[dict]) -> None:
    if not citations:
        return
    with st.expander(f"Sources and evidence ({len(citations)})", expanded=False):
        for citation in citations:
            location = []
            if citation.get("page"):
                location.append(f"page {citation['page']}")
            if citation.get("section"):
                location.append(citation["section"])
            source_location = " · ".join(location) or citation["source_type"]
            st.markdown(
                f"**[{citation['id']}] {citation['filename']}** · {source_location}"
                + (f" · relevance {citation['score']:.2f}" if citation.get("score") is not None else "")
            )
            st.caption(citation.get("snippet", ""))


def show_query_result(result: dict) -> None:
    if result["abstained"]:
        st.warning(ABSTENTION)
    else:
        st.markdown(result["answer"])
    if result.get("mode") == "evidence-only":
        st.caption("Evidence-only mode · answer contains retrieved source excerpts; no model-generated summary.")
    elif result.get("mode") == "model":
        st.caption("Model-generated answer · check the source excerpts below.")
    if result.get("notice"):
        st.info(result["notice"])
    show_citations(result["citations"])


metrics = engine.metrics()
st.markdown('<div class="hero-kicker">TEAM KNOWLEDGE · MADE SEARCHABLE</div>', unsafe_allow_html=True)
st.title("Organizational memory")
st.markdown(
    '<div class="hero-copy">Find the reasoning behind past decisions, get answers grounded in your '
    'documents, and make handovers easier to trust.</div>',
    unsafe_allow_html=True,
)

metric_columns = st.columns(3)
metric_columns[0].metric("Indexed documents", metrics["documents"])
metric_columns[1].metric("Searchable chunks", metrics["chunks"])
metric_columns[2].metric("Questions asked", metrics["queries"])
st.markdown("<div style='height: 1.1rem'></div>", unsafe_allow_html=True)

feedback = st.session_state.pop("ingestion_feedback", None)
if feedback:
    if feedback["indexed"]:
        st.success(f"Indexed {feedback['indexed']} document(s).")
    if feedback["duplicates"]:
        st.info(f"Skipped {feedback['duplicates']} duplicate document(s).")
    for filename, message in feedback["errors"]:
        st.error(f"{filename}: {message}")
    for filename, message in feedback["warnings"]:
        st.warning(f"{filename}: {message}")

with st.sidebar:
    st.markdown("### Knowledge library")
    st.caption("Add PDF, DOCX, TXT, Markdown, CSV, or JSON files.")
    uploaded_files = st.file_uploader(
        "Choose documents",
        type=["pdf", "docx", "txt", "md", "csv", "json"],
        accept_multiple_files=True,
        max_upload_size=MAX_UPLOAD_BYTES // (1024 * 1024),
        help=f"Maximum file size: {MAX_UPLOAD_BYTES // (1024 * 1024)} MB per file.",
    )
    if uploaded_files and st.button("Add selected documents", type="primary", use_container_width=True):
        engine.upload_dir.mkdir(parents=True, exist_ok=True)
        progress = st.progress(0, text="Validating documents…")
        outcomes = []
        for index, uploaded in enumerate(uploaded_files):
            try:
                content = uploaded.getvalue()
                parse_file(uploaded.name, content)
                digest = hashlib.sha256(content).hexdigest()
                safe_name = Path(uploaded.name).name
                destination = engine.upload_dir / f"{digest[:12]}_{safe_name}"
                outcome = engine.ingest_bytes(uploaded.name, content, str(destination))
                if outcome["status"] == "indexed":
                    try:
                        destination.write_bytes(content)
                    except OSError as exc:
                        engine.remove_document(outcome["document_id"], delete_uploaded_file=False)
                        destination.unlink(missing_ok=True)
                        raise IngestionError(f"Could not store uploaded file: {exc}") from exc
                outcomes.append(outcome)
            except (IngestionError, OSError) as exc:
                outcomes.append({"status": "error", "filename": uploaded.name, "error": str(exc)})
            progress.progress((index + 1) / len(uploaded_files), text=f"Processed {index + 1}/{len(uploaded_files)}")
        st.session_state["ingestion_feedback"] = {
            "indexed": sum(item["status"] == "indexed" for item in outcomes),
            "duplicates": sum(item["status"] == "duplicate" for item in outcomes),
            "errors": [(item["filename"], item["error"]) for item in outcomes if item["status"] == "error"],
            "warnings": [
                (item["filename"], item["embedding_warning"])
                for item in outcomes if item.get("embedding_warning")
            ],
        }
        st.rerun()

    if st.button("Index files in data folders", use_container_width=True):
        with st.spinner("Extracting documents and updating the local index…"):
            report = engine.index_all()
        st.session_state["ingestion_feedback"] = {
            "indexed": report["indexed"],
            "duplicates": report["duplicates"],
            "errors": [(error["filename"], error["error"]) for error in report["errors"]],
            "warnings": [(warning["filename"], warning["message"]) for warning in report["warnings"]],
        }
        st.rerun()

    if st.button("Load fictional demo set", use_container_width=True):
        with st.spinner("Loading the synthetic sample documents…"):
            report = engine.index_directories(("demo",))
        st.session_state["ingestion_feedback"] = {
            "indexed": report["indexed"],
            "duplicates": report["duplicates"],
            "errors": [(error["filename"], error["error"]) for error in report["errors"]],
            "warnings": [(warning["filename"], warning["message"]) for warning in report["warnings"]],
        }
        st.rerun()

    st.caption("The bundled demo set is fictional and lives in `data/demo/`.")
    if os.getenv("OPENAI_API_KEY"):
        st.caption("Answer generation: configured model · embeddings: " +
                   ("OpenAI" if os.getenv("EMBEDDING_PROVIDER", "local").lower() == "openai" else "local hybrid"))
    else:
        st.caption("Answer generation: evidence-only fallback · local hybrid retrieval")

tab_qa, tab_library, tab_timeline, tab_conflicts, tab_handover = st.tabs([
    "Ask a question", "Document library", "Decision timeline", "Find discrepancies", "Handover brief"
])

with tab_qa:
    st.subheader("Ask about documented decisions")
    st.caption("Answers are grounded in indexed excerpts. Unsupported questions receive an explicit abstention.")
    if metrics["documents"] == 0:
        st.info("Start by adding documents or index the bundled fictional demo set.")
    sample_columns = st.columns(3)
    sample_questions = (
        "What database decision was recorded for the payments pilot?",
        "What is the current rollout status?",
        "What is the approved annual compensation budget?",
    )
    for index, (column, sample_question) in enumerate(zip(sample_columns, sample_questions, strict=True)):
        if column.button(sample_question, key=f"sample_question_{index}", use_container_width=True):
            st.session_state["question_input"] = sample_question
            st.rerun()

    question = st.text_input(
        "Question",
        key="question_input",
        placeholder="For example: What database decision was recorded for the payments pilot?",
    )
    if st.button("Search knowledge", type="primary", disabled=not question.strip()):
        with st.spinner("Retrieving and checking source evidence…"):
            try:
                result = engine.query(question)
                st.session_state["latest_result"] = result
                st.session_state.setdefault("history", []).append(
                    {"question": question, "result": result}
                )
            except (ValueError, OSError, RuntimeError) as exc:
                st.error(f"Search failed: {exc}")

    for entry in reversed(st.session_state.get("history", [])):
        with st.container(border=True):
            st.markdown(f"**You asked:** {entry['question']}")
            show_query_result(entry["result"])

with tab_library:
    st.subheader("Indexed documents")
    documents = engine.list_documents()
    if not documents:
        st.info("No documents indexed yet. Add a file in the sidebar or index the demo set.")
    for document in documents:
        with st.container(border=True):
            details, action = st.columns([5, 1])
            details.markdown(f"**{document['filename']}**")
            details.caption(
                f"{document['source_type']} · {document['stored_chunks']} chunks · "
                f"indexed {document['ingested_at'][:10]}"
            )
            if action.button("Remove", key=f"remove_{document['id']}"):
                engine.remove_document(document["id"])
                st.rerun()
    st.caption("Removing an uploaded file also removes its stored copy. Files in the source folders remain on disk.")

with tab_timeline:
    st.subheader("Decision timeline")
    latest = st.session_state.get("latest_result")
    if latest and latest["timeline"]:
        for item in latest["timeline"]:
            with st.container(border=True):
                st.markdown(
                    f"**{item['date']}** · explicitly stated · {item['source']} · [{item['citation_id']}]"
                )
                st.write(item["detail"])
    else:
        st.info("Ask a question with dated source evidence to view a chronological trail.")

with tab_conflicts:
    st.subheader("Potential discrepancies")
    st.caption("Reports only differences in explicitly labeled facts; it does not infer a conflict from unrelated excerpts.")
    topic = st.text_input("Topic or decision area", value="payments pilot database")
    if st.button("Compare retrieved evidence", key="compare_evidence", disabled=not topic.strip()):
        report = engine.detect_conflicts(topic)
        st.write(report["summary"])
        if report["conflicts"]:
            for conflict in report["conflicts"]:
                st.markdown(f"**{conflict['key']}**")
                for statement in conflict["statements"]:
                    st.markdown(f"- **{statement['filename']}** [{statement['id']}]: {statement['value']}")
                    st.caption(statement["snippet"])
        else:
            show_citations(report["citations"])

with tab_handover:
    st.subheader("Project handover")
    project = st.text_input("Project or team", value="payments pilot", key="handover_project")
    if st.button("Build source-linked handover", key="build_handover", disabled=not project.strip()):
        with st.spinner("Collecting relevant project evidence…"):
            st.session_state["handover"] = engine.generate_handover(project)
    handover = st.session_state.get("handover")
    if handover:
        for title, excerpts in handover["sections"].items():
            st.markdown(f"#### {title}")
            for excerpt in excerpts:
                if excerpt["citation_id"]:
                    st.markdown(f"{excerpt['excerpt']} [{excerpt['citation_id']}]")
                    st.caption(excerpt["filename"])
                else:
                    st.caption(excerpt["excerpt"])
        show_citations(handover["citations"])
        if handover.get("notice"):
            st.info(handover["notice"])
