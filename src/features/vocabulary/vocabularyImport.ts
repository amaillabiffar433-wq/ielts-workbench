import type { VocabularyEntryKind } from "../../infrastructure/repositories/LearningRepository";

export interface ParsedVocabularyEntry {
  readonly term: string;
  readonly normalizedTerm: string;
  readonly entryKind: VocabularyEntryKind;
  readonly sentence: string;
  readonly note: string;
}

const MAX_IMPORTED_ENTRIES = 20_000;

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("; ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return text(record.definition ?? record.meaning ?? record.translation ?? record.text ?? record.value);
  }
  return "";
}

function valueFrom(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function kindFrom(record: Record<string, unknown>, term: string): VocabularyEntryKind {
  const raw = valueFrom(record, ["entryKind", "kind", "type", "category"]).toLocaleLowerCase();
  if (raw === "sentence" || raw === "note" || raw === "phrase" || raw === "word") return raw;
  return /\s/u.test(term) ? "phrase" : "word";
}

function entryFromRecord(record: Record<string, unknown>): ParsedVocabularyEntry | null {
  const term = valueFrom(record, ["term", "word", "headword", "headWord", "word_s", "lemma", "name", "text"]);
  if (!term || term.length > 160) return null;
  const sentence = valueFrom(record, ["sentence", "example", "exampleSentence", "examples", "context"]);
  const definition = valueFrom(record, ["definition", "definitions", "meaning", "meanings", "translation", "cn", "chinese"]);
  const partOfSpeech = valueFrom(record, ["partOfSpeech", "pos", "pronunciation"]);
  const frequency = valueFrom(record, ["frequency", "freq", "rank"]);
  const note = [definition, partOfSpeech && `Part of speech: ${partOfSpeech}`, frequency && `Frequency/rank: ${frequency}`]
    .filter(Boolean)
    .join("\n");
  const normalizedTerm = term.toLocaleLowerCase().replace(/\s+/gu, " ");
  return { term, normalizedTerm, entryKind: kindFrom(record, term), sentence, note };
}

function recordsFromJson(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap((item) => {
    if (typeof item === "string") return [{ term: item }];
    return item && typeof item === "object" ? [item as Record<string, unknown>] : [];
  });
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["entries", "data", "words", "vocabulary", "list", "items"]) {
    if (Array.isArray(record[key])) return recordsFromJson(record[key]);
  }
  return Object.entries(record).map(([term, details]) => (
    details && typeof details === "object" ? { term, ...(details as Record<string, unknown>) } : { term, definition: details }
  ));
}

function parseDelimited(textValue: string, delimiter: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < textValue.length; index += 1) {
    const character = textValue[index];
    if (character === '"') {
      if (quoted && textValue[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) { row.push(cell.trim()); cell = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && textValue[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length === 0) return [];
  const header = rows[0].map((value, index) => value || `column${index + 1}`);
  const looksLikeHeader = header.some((value) => /word|term|meaning|definition|example|sentence/iu.test(value));
  const keys = looksLikeHeader ? header : header.map((_, index) => index === 0 ? "term" : index === 1 ? "definition" : index === 2 ? "sentence" : `column${index + 1}`);
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  return dataRows.map((values) => Object.fromEntries(keys.map((key, index) => [key, values[index] ?? ""])));
}

export function parseVocabularyText(rawText: string, fileName = "import.txt"): ParsedVocabularyEntry[] {
  const extension = fileName.toLocaleLowerCase().split(".").pop() ?? "txt";
  let records: Record<string, unknown>[];
  if (extension === "json" || extension === "jsonl") {
    if (extension === "jsonl") {
      records = rawText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
        try { return recordsFromJson(JSON.parse(line)); } catch { return []; }
      });
    } else {
      try { records = recordsFromJson(JSON.parse(rawText)); } catch { records = []; }
    }
  } else if (extension === "csv" || extension === "tsv") {
    records = parseDelimited(rawText, extension === "tsv" ? "\t" : ",");
  } else {
    records = rawText.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((term) => ({ term }));
  }
  const unique = new Set<string>();
  return records.flatMap((record) => {
    const entry = entryFromRecord(record);
    if (!entry || unique.has(`${entry.entryKind}:${entry.normalizedTerm}:${entry.sentence}`)) return [];
    unique.add(`${entry.entryKind}:${entry.normalizedTerm}:${entry.sentence}`);
    return [entry];
  }).slice(0, MAX_IMPORTED_ENTRIES);
}

