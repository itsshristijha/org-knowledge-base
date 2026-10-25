import { getApiUser, jsonError } from "@/lib/api-user";

export async function GET() {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;
  const { data, error } = await auth.supabase
    .from("answer_history")
    .select("id, question, answer, citations, mode, notice, abstained, asked_at")
    .order("asked_at", { ascending: false })
    .limit(50);
  if (error) return jsonError(`Could not load question history: ${error.message}`, 500);
  return Response.json({ history: data ?? [] });
}

export async function DELETE() {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;
  const { error } = await auth.supabase.from("answer_history").delete().eq("owner_id", auth.user.id);
  if (error) return jsonError(`Could not clear question history: ${error.message}`, 500);
  return Response.json({ cleared: true });
}
