import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getApiUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) };
  return { supabase, user };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
