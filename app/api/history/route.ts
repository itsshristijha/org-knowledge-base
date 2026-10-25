import { getApiUser, jsonError } from "@/lib/api-user";
import { ensureSchema } from "@/lib/database";

export async function GET() {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;
  await ensureSchema();
  const history = await auth.sql`
    select id, question, answer, citations, mode, notice, abstained, asked_at
    from public.answer_history
    where owner_id = ${auth.userId}
    order by asked_at desc
    limit 50
  `;
  return Response.json({ history });
}

export async function DELETE() {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;
  await ensureSchema();
  await auth.sql`delete from public.answer_history where owner_id = ${auth.userId}`;
  return Response.json({ cleared: true });
}
