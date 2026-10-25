import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDatabase } from "@/lib/database";

export async function getApiUser() {
  if (
    !process.env.AUTH_SECRET ||
    !process.env.AUTH_GOOGLE_ID ||
    !process.env.AUTH_GOOGLE_SECRET ||
    !process.env.DATABASE_URL
  ) {
    return {
      response: NextResponse.json(
        { error: "Google OAuth and Neon must be configured before using the workspace." },
        { status: 503 },
      ),
    };
  }
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
