import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/database";
import { splitText, type ParsedSection } from "@/lib/document-parser";

export async function indexDocument({
  ownerId,
  filename,
  sourceType,
  contentHash,
  content,
  sections,
}: {
  ownerId: string;
  filename: string;
  sourceType: string;
  contentHash: string;
  content: Buffer;
  sections: ParsedSection[];
}) {
  const sql = getDatabase();
  const existing = await sql`
    select id from public.documents
    where owner_id = ${ownerId} and content_hash = ${contentHash}
    limit 1
  `;
  if (existing[0]) return { status: "duplicate" as const, documentId: existing[0].id as string, chunks: 0 };

  const documentId = randomUUID();
  const rows = sections.flatMap((section) =>
    splitText(section.text).map((text) => [
      documentId,
      ownerId,
      text,
      section.page ?? null,
      section.section ?? null,
      section.author ?? null,
      section.recorded_at ?? null,
    ]),
  );
  const chunkValues = rows.flatMap((row) => row);
  const chunkPlaceholders = rows.map((_, rowIndex) => {
    const offset = rowIndex * 7;
    return `(${Array.from({ length: 7 }, (_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
  });
  await sql.transaction((transaction) => {
    const queries = [
      transaction`
      insert into public.documents (id, owner_id, filename, source_type, content_hash, file_data)
      values (
        ${documentId}, ${ownerId}, ${filename}, ${sourceType}, ${contentHash},
        decode(${content.toString("base64")}, 'base64')
      )
      `,
    ];
    if (rows.length) {
      queries.push(
        transaction.query(
        `insert into public.chunks (document_id, owner_id, content, page, section, author, recorded_at) values ${chunkPlaceholders.join(", ")}`,
        chunkValues,
        ) as typeof queries[number],
      );
    }
    return queries;
  });
  return { status: "indexed" as const, documentId, chunks: rows.length };
}
