import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getApiUser, jsonError } from "@/lib/api-user";
import { parseDocument, splitText } from "@/lib/document-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;

  const demoDirectory = path.join(process.cwd(), "data", "demo");
  const names = [
    "01_product_brief.md",
    "02_architecture_meeting.md",
    "03_adr_014.md",
    "04_incident_022.md",
    "05_handover_009.md",
  ];
  let indexed = 0;
  let duplicates = 0;

  for (const filename of names) {
    const content = await readFile(path.join(demoDirectory, filename));
    const contentHash = createHash("sha256").update(content).digest("hex");
    const sections = await parseDocument(filename, content);
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
    if (duplicateError) return jsonError(`Could not check demo documents: ${duplicateError.message}`, 500);
    if (existing) {
      duplicates++;
      continue;
    }

    const documentId = randomUUID();
    const storagePath = `${auth.user.id}/${documentId}/${filename}`;
    const { error: uploadError } = await auth.supabase.storage
      .from("organization-documents")
      .upload(storagePath, content, { contentType: "text/markdown", upsert: false });
    if (uploadError) return jsonError(`Could not store ${filename}: ${uploadError.message}`, 500);

    const { data: document, error: insertError } = await auth.supabase
      .from("documents")
      .insert({
        id: documentId,
        owner_id: auth.user.id,
        filename,
        source_type: "Markdown",
        content_hash: contentHash,
        storage_path: storagePath,
        chunk_count: rows.length,
      })
      .select("id")
      .single();
    if (insertError || !document) {
      await auth.supabase.storage.from("organization-documents").remove([storagePath]);
      return jsonError(`Could not add ${filename}: ${insertError?.message ?? "unknown error"}`, 500);
    }

    const { error: chunksError } = await auth.supabase.from("chunks").insert(
      rows.map((row) => ({ ...row, document_id: document.id })),
    );
    if (chunksError) {
      await auth.supabase.from("documents").delete().eq("id", document.id);
      await auth.supabase.storage.from("organization-documents").remove([storagePath]);
      return jsonError(`Could not index ${filename}: ${chunksError.message}`, 500);
    }
    indexed++;
  }

  return Response.json({ indexed, duplicates });
}
