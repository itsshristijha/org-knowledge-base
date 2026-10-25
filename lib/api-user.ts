import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDatabase } from "@/lib/database";

export async function getApiUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { response: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) };
  }
  try {
    return { userId, sql: getDatabase() };
  } catch (error) {
    return {
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : "Database is not configured." },
        { status: 503 },
      ),
    };
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
