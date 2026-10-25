import assert from "node:assert/strict";
import test from "node:test";
import { parseDocument, splitText } from "../lib/document-parser";
import {
  ABSTENTION,
  corpusFingerprint,
  extractTimeline,
  extractiveAnswer,
  normalizeQuestion,
  questionSimilarity,
} from "../lib/knowledge";

test("markdown parsing preserves headings and extracts readable sections", async () => {
  const sections = await parseDocument(
    "decision.md",
    Buffer.from("# Approved decision\n\nPostgreSQL was selected for the pilot.\n"),
  );
  assert.equal(sections.length, 1);
  assert.equal(sections[0].section, "Approved decision");
  assert.match(sections[0].text, /PostgreSQL/);
});

test("CSV and JSON parsing retains labels and message metadata", async () => {
  const csv = await parseDocument("decisions.csv", Buffer.from("date,decision\n2026-06-13,PostgreSQL selected\n"));
  assert.match(csv[0].text, /decision: PostgreSQL selected/);

  const json = await parseDocument(
    "messages.json",
    Buffer.from(JSON.stringify([{ user: "Platform Engineer", ts: "2026-06-13", text: "Approved." }])),
  );
  assert.equal(json[0].author, "Platform Engineer");
  assert.equal(json[0].recorded_at, "2026-06-13");
});

test("unsupported, empty, oversized, and malformed documents fail explicitly", async () => {
  await assert.rejects(parseDocument("program.exe", Buffer.from("x")), /Unsupported file type/);
  await assert.rejects(parseDocument("empty.md", Buffer.alloc(0)), /empty/);
  await assert.rejects(parseDocument("large.txt", Buffer.alloc(10 * 1024 * 1024 + 1)), /10 MB/);
  await assert.rejects(parseDocument("broken.json", Buffer.from("{")), SyntaxError);
});

test("chunk splitting respects maximum size while retaining overlapping context", () => {
  const content = `${"Sentence with useful evidence. ".repeat(90)}`;
  const chunks = splitText(content, 280, 40);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 281));
  assert.ok(chunks[0].slice(-30).split(" ").some((token) => chunks[1].includes(token)));
});

test("normalization and similar-question cache are conservative", () => {
  assert.equal(
    normalizeQuestion("Which database was selected for the Payments Pilot?"),
    "database selected payments pilot",
  );
  assert.ok(questionSimilarity(
    "Which database was selected for the Payments Pilot?",
    "For the Payments Pilot, which database was selected?",
  ) >= 0.88);
  assert.ok(questionSimilarity(
    "Which database was selected for the Payments Pilot?",
    "What compensation budget was approved?",
  ) < 0.88);
  assert.equal(corpusFingerprint(["b", "a"]), corpusFingerprint(["a", "b"]));
  assert.notEqual(corpusFingerprint(["a"]), corpusFingerprint(["a", "b"]));
});

test("source excerpts and dates remain attached to citations", () => {
  const citations = [{
    id: "S1",
    filename: "decision.md",
    source_type: "Markdown",
    snippet: "Decision date: 2026-06-13. PostgreSQL selected.",
  }];
  assert.match(extractiveAnswer(citations), /\[S1\]/);
  assert.equal(extractiveAnswer([]), ABSTENTION);
  assert.deepEqual(extractTimeline(citations), [{
    date: "2026-06-13",
    source: "decision.md",
    detail: "Decision date: 2026-06-13. PostgreSQL selected.",
    citation_id: "S1",
  }]);
});
