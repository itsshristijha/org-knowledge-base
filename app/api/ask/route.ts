import { getApiUser, jsonError } from "@/lib/api-user";
import {
  ABSTENTION,
  corpusFingerprint,
  extractTimeline,
  generateAnswer,
  normalizeQuestion,
  questionSimilarity,
  type Answer,
  type Citation,
} from "@/lib/knowledge";

export const maxDuration = 60;

type SearchRow = {
  id: number;
  document_id: string;
  filename: string;
  source_type: string;
  content: string;
  page: number | null;
  section: string | null;
  author: string | null;
  recorded_at: string | null;
  score: number;
};

type HistoryRow = {
  question: string;
  answer: string;
  citations: Citation[];
  mode: Answer["mode"];
  notice: string | null;
  abstained: boolean;
  asked_at: string;
};

export async function POST(request: Request) {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;

  let question: string;
  try {
    const body = await request.json() as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    return jsonError("The question request is invalid.");
  }
  if (!question) return jsonError("Enter a question before searching.");
  if (question.length > 2000) return jsonError("Questions must be 2,000 characters or fewer.");
  const normalized = normalizeQuestion(question);
  if (normalized.split(" ").length < 2) return jsonError("Please enter a more specific question.");

  const { data: documents, error: docsError } = await auth.supabase
    .from("documents")
    .select("content_hash")
    .order("content_hash");
  if (docsError) return jsonError(`Could not prepare your document library: ${docsError.message}`, 500);
  const fingerprint = corpusFingerprint((documents ?? []).map((document) => document.content_hash));

  const { data: recentHistory, error: historyError } = await auth.supabase
    .from("answer_history")
    .select("question, answer, citations, mode, notice, abstained, asked_at")
    .eq("corpus_fingerprint", fingerprint)
    .eq("abstained", false)
    .order("asked_at", { ascending: false })
    .limit(100);
  if (historyError) return jsonError(`Could not check saved answers: ${historyError.message}`, 500);

  const cacheMatch = ((recentHistory ?? []) as HistoryRow[])
    .map((item) => ({ item, similarity: questionSimilarity(question, item.question) }))
    .filter(({ similarity }) => similarity >= 0.88)
    .sort((left, right) => right.similarity - left.similarity)[0];

  let result: Answer;
  if (cacheMatch) {
    const saved = cacheMatch.item;
    result = {
      answer: saved.answer,
      citations: saved.citations,
      timeline: extractTimeline(saved.citations),
      mode: "cached",
      notice: saved.notice,
      abstained: false,
      cached: true,
      cached_at: saved.asked_at,
      original_question: saved.question,
    };
  } else {
    const { data, error } = await auth.supabase.rpc("search_chunks", {
      search_query: question,
      match_count: 6,
    });
    if (error) return jsonError(`Could not search your documents: ${error.message}`, 500);

    const rows = ((data ?? []) as SearchRow[]).filter((row) => row.score > 0);
    const citations: Citation[] = rows.map((row, index) => ({
      id: `S${index + 1}`,
      document_id: row.document_id,
      filename: row.filename,
      source_type: row.source_type,
      page: row.page,
      section: row.section,
      author: row.author,
      timestamp: row.recorded_at,
      snippet: row.content,
      score: row.score,
    }));
    if (!citations.length) {
      result = {
        answer: ABSTENTION,
        citations: [],
        timeline: [],
        mode: "abstention",
        abstained: true,
      };
    } else {
      const generated = await generateAnswer(question, citations);
      result = {
        ...generated,
        citations,
        timeline: extractTimeline(citations),
        abstained: generated.answer === ABSTENTION,
      };
    }
  }

  const { error: saveError } = await auth.supabase.from("answer_history").insert({
    owner_id: auth.user.id,
    question,
    normalized_question: normalized,
    answer: result.answer,
    citations: result.citations,
    mode: result.mode,
    notice: result.notice ?? null,
    abstained: result.abstained,
    corpus_fingerprint: fingerprint,
  });
  if (saveError) return jsonError(`Answer found but could not save it to your history: ${saveError.message}`, 500);
  return Response.json(result);
}
