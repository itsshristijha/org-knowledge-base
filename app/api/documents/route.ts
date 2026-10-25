import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getApiUser, jsonError } from "@/lib/api-user";
import { ensureSchema } from "@/lib/database";
import { indexDocument } from "@/lib/index-document";
import { MAX_UPLOAD_BYTES, parseDocument, SUPPORTED_EXTENSIONS } from "@/lib/document-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;
  await ensureSchema();
  const documents = await auth.sql`
    select id, filename, source_type, created_at, chunk_count
    from (
      select d.id, d.filename, d.source_type, d.created_at, count(c.id)::integer as chunk_count
      from public.documents d
      left join public.chunks c on c.document_id = d.id and c.owner_id = ${auth.userId}
      where d.owner_id = ${auth.userId}
      group by d.id
    ) user_documents
    order by created_at desc
  `;
  const totals = await auth.sql`
    select count(*)::integer as questions
    from public.answer_history where owner_id = ${auth.userId}
  `;
  return NextResponse.json({
    documents,
    chunks: documents.reduce((total, document) => total + Number(document.chunk_count), 0),
    questions: Number(totals[0]?.questions ?? 0),
  });
}

export async function POST(request: Request) {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;
  await ensureSchema();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("The upload request is invalid.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Choose a document to upload.");
  const filename = file.name.split(/[\\/]/).pop()?.trim();
  if (!filename) return jsonError("The filename is invalid.");
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  if (!SUPPORTED_EXTENSIONS.has(extension)) return jsonError("This file type is not supported.");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError("File exceeds the 4 MB upload limit.", 413);

  const content = Buffer.from(await file.arrayBuffer());
  let sections;
  try {
    sections = await parseDocument(filename, content);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not parse the document.", 422);
  }
  const contentHash = createHash("sha256").update(content).digest("hex");
  try {
    const result = await indexDocument({
      ownerId: auth.userId,
      filename,
      sourceType: extension.slice(1).toUpperCase(),
      contentHash,
      content,
      sections,
    });
    return NextResponse.json({
      status: result.status,
      document_id: result.documentId,
      filename,
      chunks: result.chunks,
    });
  } catch (error) {
    return jsonError(`Could not save the document: ${error instanceof Error ? error.message : "database error"}`, 500);
  }
}
