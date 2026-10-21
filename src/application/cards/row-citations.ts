import { cardLimits } from './card-limits.js';
import { cardItems } from './card-items.js';
import { searchJson } from './extract-json.js';

// RF-202 (Q-47): a citation into a rendered workbook file may name rows instead of lines
// (`values.md:R8`, `values.md:R8-R12`), because every line of such a file starts with its row,
// `R8 | `. Such a citation is mapped to the lines that start with those rows when each row is
// found; otherwise it is left as written and the citation check drops it. The stored card always
// holds `path:startLine-endLine`.

/** The first and the last line (1-based) that start with one row. */
export interface RowSpan {
  readonly first: number;
  readonly last: number;
}

/** The row spans of one file, or undefined when the file cannot be read. */
export type RowLookup = (path: string) => Promise<ReadonlyMap<number, RowSpan> | undefined>;

/** The row spans of the files an answer names, by the path as the answer wrote it. */
export type RowIndex = ReadonlyMap<string, ReadonlyMap<number, RowSpan>>;

/** Files looked up for one answer: model output is untrusted, so what it can make Rosetta read is bounded. */
const maxLookups = 20;

const rowPrefix = /^R(\d{1,9}) \| /;
const rowCitation = /^(.+):R(\d{1,9})(?:-R?(\d{1,9}))?$/;

/** The lines of a rendered workbook file by the row they start with. */
export function rowSpans(lines: readonly string[]): ReadonlyMap<number, RowSpan> {
  const spans = new Map<number, RowSpan>();
  lines.forEach((line, index) => {
    const row = rowPrefix.exec(line)?.[1];
    if (row === undefined) return;
    const number = Number(row);
    spans.set(number, { first: spans.get(number)?.first ?? index + 1, last: index + 1 });
  });
  return spans;
}

interface RowCitation {
  readonly path: string;
  readonly from: number;
  readonly to: number;
}

function parseRowCitation(text: string): RowCitation | undefined {
  const parts = rowCitation.exec(text.trim());
  if (parts === null) return undefined;
  const [, path = '', from = '', to = from] = parts;
  return { path, from: Number(from), to: Number(to) };
}

/** The claims of a card object, or undefined when it holds none. */
function claimsOf(card: unknown): readonly unknown[] | undefined {
  if (typeof card !== 'object' || card === null || !('claims' in card)) return undefined;
  return Array.isArray(card.claims) ? card.claims : undefined;
}

/** The citations of a claim object, or undefined when it holds none. */
function citationsOf(claim: unknown): readonly unknown[] | undefined {
  if (typeof claim !== 'object' || claim === null || !('citations' in claim)) return undefined;
  return Array.isArray(claim.citations) ? claim.citations : undefined;
}

/** Every citation string of the cards in one JSON value of an answer. */
function citationStrings(value: unknown): readonly string[] {
  const claims = (cardItems(value) ?? []).flatMap((card) => claimsOf(card) ?? []);
  const citations = claims.flatMap((claim) => citationsOf(claim) ?? []);
  return citations.filter((citation): citation is string => typeof citation === 'string');
}

/** The files named by the row citations of an answer, each once, at most `maxLookups`. */
function rowPaths(raw: string): readonly string[] {
  const named = searchJson(raw)
    .values.flatMap(citationStrings)
    .flatMap((citation) => parseRowCitation(citation)?.path ?? []);
  return [...new Set(named)].slice(0, maxLookups);
}

/** Reads the files named by the row citations of an answer, each once. */
export async function loadRowIndex(raw: string, lookup: RowLookup): Promise<RowIndex> {
  if (raw.length > cardLimits.maxOutputChars) return new Map();
  const index = new Map<string, ReadonlyMap<number, RowSpan>>();
  for (const path of rowPaths(raw)) {
    const spans = await lookup(path);
    if (spans !== undefined) index.set(path, spans);
  }
  return index;
}

function mapCitation(citation: unknown, index: RowIndex): unknown {
  const parsed = typeof citation === 'string' ? parseRowCitation(citation) : undefined;
  if (parsed === undefined) return citation;
  const spans = index.get(parsed.path);
  const start = spans?.get(parsed.from);
  const end = spans?.get(parsed.to);
  if (start === undefined || end === undefined || end.last < start.first) return citation;
  return `${parsed.path}:${String(start.first)}-${String(end.last)}`;
}

function mapClaim(claim: unknown, index: RowIndex): unknown {
  const citations = citationsOf(claim);
  if (typeof claim !== 'object' || claim === null || citations === undefined) return claim;
  return { ...claim, citations: citations.map((each) => mapCitation(each, index)) };
}

/** The card with its row citations written as lines; a row that is not in the index stays as written. */
// RF-202
export function mapRowCitations(card: unknown, index: RowIndex): unknown {
  const claims = claimsOf(card);
  if (index.size === 0 || typeof card !== 'object' || card === null || claims === undefined) {
    return card;
  }
  return { ...card, claims: claims.map((claim) => mapClaim(claim, index)) };
}
