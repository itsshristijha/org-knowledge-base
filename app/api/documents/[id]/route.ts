import { getApiUser, jsonError } from "@/lib/api-user";
import { ensureSchema } from "@/lib/database";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;
  await ensureSchema();
  const { id } = await context.params;
  const deleted = await auth.sql`
    delete from public.documents
    where id = ${id} and owner_id = ${auth.userId}
    returning id
  `;
  if (!deleted.length) return jsonError("Document not found.", 404);
  return Response.json({ removed: true });
}
