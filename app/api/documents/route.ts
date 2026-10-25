import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getApiUser, jsonError } from "@/lib/api-user";
import { MAX_UPLOAD_BYTES, parseDocument, splitText, SUPPORTED_EXTENSIONS } from "@/lib/document-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;

  const { data: documents, error } = await auth.supabase
    .from("documents")
    .select("id, filename, source_type, created_at, chunk_count")
    .order("created_at", { ascending: false });
  if (error) return jsonError(`Could not load documents: ${error.message}`, 500);

  const { count, error: historyError } = await auth.supabase
    .from("answer_history")
    .select("id", { count: "exact", head: true });
  if (historyError) return jsonError(`Could not load question count: ${historyError.message}`, 500);

  return NextResponse.json({
    documents: documents ?? [],
    chunks: (documents ?? []).reduce((total, document) => total + document.chunk_count, 0),
    questions: count ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;

  let body: { filename?: string; storagePath?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return jsonError("The upload request is invalid.");
  }
  const filename = body.filename?.split(/[\\/]/).pop()?.trim();
  const storagePath = body.storagePath;
  if (!filename || !storagePath || !storagePath.startsWith(`${auth.user.id}/`)) {
    return jsonError("The upload details are invalid.");
  }
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  if (!SUPPORTED_EXTENSIONS.has(extension)) return jsonError("This file type is not supported.");

  const { data: storedFile, error: downloadError } = await auth.supabase.storage
    .from("organization-documents")
    .download(storagePath);
  if (downloadError || !storedFile) return jsonError("Could not read the uploaded document.", 422);
  if (storedFile.size > MAX_UPLOAD_BYTES) {
    await auth.supabase.storage.from("organization-documents").remove([storagePath]);
    return jsonError("File exceeds the 10 MB upload limit.", 413);
  }

  const content = Buffer.from(await storedFile.arrayBuffer());
  let sections;
  try {
    sections = await parseDocument(filename, content);
  } catch (error) {
    await auth.supabase.storage.from("organization-documents").remove([storagePath]);
    return jsonError(error instanceof Error ? error.message : "Could not parse the document.", 422);
  }

  const contentHash = createHash("sha256").update(content).digest("hex");
  const rows = sections.flatMap((section) =>
    splitText(section.text).map((text) => ({
      owner_id: auth.user.id,
      content: text,
      page: section.page ?? null,
      section: section.section ?? null,
      author: section.author ?? null,
      recorded_at: section.recorded_at ?? null,
    })),
  );
  const { data: existing, error: duplicateError } = await auth.supabase
    .from("documents")
    .select("id")
    .eq("owner_id", auth.user.id)
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (duplicateError) return jsonError(`Could not check for duplicates: ${duplicateError.message}`, 500);
  if (existing) {
    const { error: cleanupError } = await auth.supabase.storage
      .from("organization-documents")
      .remove([storagePath]);
    if (cleanupError) return jsonError(`This document already exists, but the duplicate upload could not be removed: ${cleanupError.message}`, 500);
    return NextResponse.json({ status: "duplicate", document_id: existing.id, filename });
  }

  const { data: document, error: insertError } = await auth.supabase
    .from("documents")
    .insert({
      owner_id: auth.user.id,
      filename,
      source_type: extension.slice(1).toUpperCase(),
      content_hash: contentHash,
      storage_path: storagePath,
      chunk_count: rows.length,
    })
    .select("id")
    .single();
  if (insertError || !document) {
    await auth.supabase.storage.from("organization-documents").remove([storagePath]);
    return jsonError(`Could not save the document: ${insertError?.message ?? "unknown error"}`, 500);
  }

  const { error: chunksError } = await auth.supabase.from("chunks").insert(
    rows.map((row) => ({ ...row, document_id: document.id })),
  );
  if (chunksError) {
    await auth.supabase.from("documents").delete().eq("id", document.id);
    await auth.supabase.storage.from("organization-documents").remove([storagePath]);
    return jsonError(`Could not index the document: ${chunksError.message}`, 500);
  }

  return NextResponse.json({ status: "indexed", document_id: document.id, filename, chunks: rows.length });
}
