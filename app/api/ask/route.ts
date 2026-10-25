import { randomUUID } from "node:crypto";
import { getApiUser, jsonError } from "@/lib/api-user";
import { ensureSchema } from "@/lib/database";
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
  await ensureSchema();

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

  const documents = await auth.sql`
    select content_hash from public.documents
    where owner_id = ${auth.userId}
    order by content_hash
  `;
  const fingerprint = corpusFingerprint(documents.map((document) => String(document.content_hash)));
  const recentHistory = await auth.sql`
    select question, answer, citations, mode, notice, abstained, asked_at
    from public.answer_history
    where owner_id = ${auth.userId}
      and corpus_fingerprint = ${fingerprint}
      and abstained = false
    order by asked_at desc
    limit 100
  ` as HistoryRow[];
  const cacheMatch = recentHistory
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
    const rows = await auth.sql`
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
        ts_rank_cd(to_tsvector('english', c.content), websearch_to_tsquery('english', ${question})) as score
      from public.chunks c
      join public.documents d on d.id = c.document_id and d.owner_id = ${auth.userId}
      where c.owner_id = ${auth.userId}
        and to_tsvector('english', c.content) @@ websearch_to_tsquery('english', ${question})
      order by score desc, c.id desc
      limit 6
    ` as SearchRow[];
    const citations: Citation[] = rows.filter((row) => Number(row.score) > 0).map((row, index) => ({
      id: `S${index + 1}`,
      document_id: row.document_id,
      filename: row.filename,
      source_type: row.source_type,
      page: row.page,
      section: row.section,
      author: row.author,
      timestamp: row.recorded_at,
      snippet: row.content,
      score: Number(row.score),
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

  await auth.sql`
    insert into public.answer_history (
      id, owner_id, question, normalized_question, answer, citations, mode,
      notice, abstained, corpus_fingerprint
    ) values (
      ${randomUUID()}, ${auth.userId}, ${question}, ${normalized}, ${result.answer},
      ${JSON.stringify(result.citations)}::jsonb, ${result.mode}, ${result.notice ?? null},
      ${result.abstained}, ${fingerprint}
    )
  `;
  return Response.json(result);
}
