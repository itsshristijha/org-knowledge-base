import { parse as parseCsv } from "csv-parse/sync";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".md", ".csv", ".json"]);

export type ParsedSection = {
  text: string;
  page?: number;
  section?: string;
  author?: string;
  recorded_at?: string;
};

function cleanText(text: string) {
  return text.replace(/[ \t]+/g, " ").trim();
}

function parseTextSections(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let heading: string | undefined;
  let body: string[] = [];
  const flush = () => {
    const content = cleanText(body.join("\n"));
    if (content) sections.push({ text: content, section: heading });
    body = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const headingMatch = line.trim().match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flush();
      heading = headingMatch[1].trim();
    } else if (line.trim()) {
      body.push(line.trim());
    } else {
      flush();
    }
  }
  flush();
  return sections;
}

export async function parseDocument(filename: string, content: Buffer): Promise<ParsedSection[]> {
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported file type: ${extension || "(no extension)"}`);
  }
  if (!content.length) throw new Error("The file is empty.");
  if (content.length > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 10 MB upload limit.");

  let sections: ParsedSection[];
  if (extension === ".pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(content));
    const parsed = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(parsed.text) ? parsed.text : [parsed.text];
    sections = pages.map((text, index) => ({
      text: cleanText(text),
      page: index + 1,
    })).filter((section) => section.text);
  } else if (extension === ".docx") {
    const parsed = await mammoth.extractRawText({ buffer: content });
    sections = parseTextSections(parsed.value);
  } else if (extension === ".txt" || extension === ".md") {
    sections = parseTextSections(content.toString("utf8").replace(/^\uFEFF/, ""));
  } else if (extension === ".csv") {
    const rows = parseCsv(content, { bom: true, skip_empty_lines: true });
    if (rows.length < 2) throw new Error("CSV must contain a header and at least one data row.");
    const headers = rows[0] as string[];
    sections = (rows.slice(1) as string[][])
      .map((row) => ({
        text: row
          .map((value, index) => (value?.trim() && headers[index] ? `${headers[index]}: ${value}` : ""))
          .filter(Boolean)
          .join("; "),
      }))
      .filter((row) => row.text);
  } else {
    const data: unknown = JSON.parse(content.toString("utf8").replace(/^\uFEFF/, ""));
    const records = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { messages?: unknown }).messages)
        ? (data as { messages: unknown[] }).messages
        : [data];
    sections = records.flatMap((record) => {
      if (typeof record === "string" && record.trim()) return [{ text: cleanText(record) }];
      if (!record || typeof record !== "object") return [];
      const item = record as Record<string, unknown>;
      const text = String(item.text ?? item.content ?? "").trim();
      if (!text) return [];
      return [{
        text: cleanText(text),
        author: item.author || item.user ? String(item.author ?? item.user) : undefined,
        recorded_at: item.timestamp || item.ts || item.date
          ? String(item.timestamp ?? item.ts ?? item.date)
          : undefined,
        section: item.channel ? String(item.channel) : undefined,
      }];
    });
  }

  const readable = sections.filter((section) => section.text);
  if (!readable.length) throw new Error("No readable text could be extracted from this file.");
  return readable;
}

export function splitText(text: string, size = 1000, overlap = 160): string[] {
  const normalized = cleanText(text);
  if (normalized.length <= size) return normalized ? [normalized] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf("\n", end),
        normalized.lastIndexOf(" ", end),
      );
      if (boundary > start + size / 2) end = boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
