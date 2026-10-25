import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", request.url).toString() },
  });
  if (error || !data.url) {
    return NextResponse.redirect(new URL("/?auth=failed", request.url));
  }
  return NextResponse.redirect(data.url);
}
