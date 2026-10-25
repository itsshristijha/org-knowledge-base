import { getApiUser, jsonError } from "@/lib/api-user";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  const { data: document, error: lookupError } = await auth.supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) return jsonError(`Could not load the document: ${lookupError.message}`, 500);
  if (!document) return jsonError("Document not found.", 404);

  const { error: storageError } = await auth.supabase.storage
    .from("organization-documents")
    .remove([document.storage_path]);
  if (storageError) return jsonError(`Could not remove the stored file: ${storageError.message}`, 500);

  const { error: deleteError } = await auth.supabase.from("documents").delete().eq("id", id);
  if (deleteError) return jsonError(`Could not remove the document: ${deleteError.message}`, 500);
  return Response.json({ removed: true });
}
