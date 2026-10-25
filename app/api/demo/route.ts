import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getApiUser, jsonError } from "@/lib/api-user";
import { ensureSchema } from "@/lib/database";
import { indexDocument } from "@/lib/index-document";
import { parseDocument } from "@/lib/document-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const auth = await getApiUser();
  if ("response" in auth) return auth.response;
  await ensureSchema();

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
    const sections = await parseDocument(filename, content);
    const result = await indexDocument({
      ownerId: auth.userId,
      filename,
      sourceType: "Markdown",
      contentHash: createHash("sha256").update(content).digest("hex"),
      content,
      sections,
    });
    if (result.status === "duplicate") duplicates++;
    else indexed++;
  }
  return Response.json({ indexed, duplicates });
}
