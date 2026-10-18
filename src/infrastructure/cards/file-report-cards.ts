import { parse } from 'yaml';
import { z } from 'zod';
import { cardLimits } from '../../application/cards/card-limits.js';
import type { ReportCardFiles } from '../../application/ports/report-card-files.js';
import type { RunFileReader } from '../../application/ports/run-file-reader.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { CardFile, CardFileClaim } from '../../application/report/card-evidence.js';
import { CARD_TYPES, CLAIM_STATUSES, CONFIDENCES } from '../../domain/cards/card-vocabulary.js';
import { parseCitation, type Citation } from '../../domain/cards/citation.js';

// RF-502, data-model.md section 3.7, ADR-013: the card files of a run read for the pages of the
// report. The YAML header is the data. A person can edit the files, so the size of the file, the
// path, the header, every string and list in it and every citation are checked; a file that does
// not read is left out (its card keeps its row in the report but gets no page) instead of being
// half read.

/** The most bytes of a card file that are read; a larger file is no card of Rosetta's. */
const MAX_FILE_BYTES = 256 * 1024;
/**
 * A merged card holds the claims of every member (RF-250), so it may hold more than one agent wrote.
 * The factor 4 allows a merge of four cards that were each at the limit; a card beyond that is not
 * one Rosetta wrote, and 200 claims still keep the page bounded.
 */
const MAX_CLAIMS = 4 * cardLimits.maxClaims;
const MAX_CITATION_CHARS = cardLimits.maxPathChars + 24;

const text = (max: number): z.ZodString => z.string().max(max);

const claimSchema = z.object({
  claimId: z
    .string()
    .max(40)
    .regex(/^[A-Z]+-[0-9]+[.]c[0-9]+$/u),
  text: text(cardLimits.maxClaimChars),
  citations: z.array(text(MAX_CITATION_CHARS)).max(cardLimits.maxCitations),
  status: z.enum(CLAIM_STATUSES),
  verdict: z.object({ reason: text(cardLimits.maxSummaryChars) }).optional(),
});

const headerSchema = z.object({
  id: z
    .string()
    .max(40)
    .regex(/^[A-Z]+-[0-9]+$/u),
  type: z.enum(CARD_TYPES),
  title: text(cardLimits.maxTitleChars),
  summary: text(cardLimits.maxSummaryChars),
  area: text(cardLimits.maxAreaChars),
  confidence: z.enum(CONFIDENCES),
  claims: z.array(claimSchema).max(MAX_CLAIMS),
  question: text(cardLimits.maxQuestionChars).optional(),
  whyItMatters: text(cardLimits.maxSummaryChars).optional(),
  questionState: z.enum(['Open', 'Answered']).optional(),
  note: text(cardLimits.maxSummaryChars).optional(),
});

type Header = z.infer<typeof headerSchema>;

const cardFile = new RegExp(`^cards/(${CARD_TYPES.join('|')})/([A-Z]+-[0-9]+)[.]md$`, 'u');
const HEADER_END = '\n---\n';

function citationsOf(texts: readonly string[]): Citation[] | undefined {
  const citations: Citation[] = [];
  for (const each of texts) {
    const parsed = parseCitation(each);
    if (!parsed.ok) return undefined;
    citations.push(parsed.value);
  }
  return citations;
}

function headerOf(fileText: string): unknown {
  const end = fileText.indexOf(HEADER_END, 4);
  if (!fileText.startsWith('---\n') || end < 0) return undefined;
  try {
    const header: unknown = parse(fileText.slice(4, end));
    return header;
  } catch {
    // A header that is not YAML is no card: the report gives it no page.
    return undefined;
  }
}

/** The fields of a card that are left out when the header has none. */
function optionalFields(header: Header): Partial<CardFile> {
  const { question, whyItMatters, questionState, note } = header;
  return {
    ...(question === undefined ? {} : { question }),
    ...(whyItMatters === undefined ? {} : { whyItMatters }),
    ...(questionState === undefined ? {} : { questionState }),
    ...(note === undefined ? {} : { note }),
  };
}

function claimsOf(header: Header): CardFile['claims'] | undefined {
  const claims: CardFileClaim[] = [];
  for (const claim of header.claims) {
    // A claim belongs to its card: `<card id>.c<n>`.
    if (!claim.claimId.startsWith(`${header.id}.c`)) return undefined;
    const citations = citationsOf(claim.citations);
    if (citations === undefined) return undefined;
    const { claimId, status, verdict } = claim;
    const reason = verdict === undefined ? {} : { reason: verdict.reason };
    claims.push({ claimId, text: claim.text, status, citations, ...reason });
  }
  return claims;
}

function cardOf(fileText: string, expected: { type: string; id: string }): CardFile | undefined {
  const parsed = headerSchema.safeParse(headerOf(fileText));
  if (!parsed.success) return undefined;
  const header = parsed.data;
  // The file name is the identity of a card: a header that says otherwise is another card's.
  if (header.id !== expected.id || header.type !== expected.type) return undefined;
  const claims = claimsOf(header);
  if (claims === undefined) return undefined;
  const { id, type, title, summary, area, confidence } = header;
  return { id, type, title, summary, area, confidence, ...optionalFields(header), claims };
}

/** The text of the file, or undefined when it is missing, is not a plain file or is over the limit. */
async function boundedText(
  files: RunFileReader,
  scope: RunScope,
  name: string,
): Promise<string | undefined> {
  const opened = await files.open(scope, name);
  if (!opened.ok || opened.value.size > MAX_FILE_BYTES) return undefined;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of opened.value.body) {
    total += chunk.length;
    if (total > MAX_FILE_BYTES) return undefined;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export class FileReportCards implements ReportCardFiles {
  private readonly files: RunFileReader;

  constructor(files: RunFileReader) {
    this.files = files;
  }

  // RF-502
  async read(scope: RunScope, paths: readonly string[]): Promise<readonly CardFile[]> {
    const cards = new Map<string, CardFile>();
    for (const name of paths) {
      const match = cardFile.exec(name);
      if (match === null) continue;
      const [, type = '', id = ''] = match;
      if (cards.has(id)) continue;
      const fileText = await boundedText(this.files, scope, name);
      const card = fileText === undefined ? undefined : cardOf(fileText, { type, id });
      if (card !== undefined) cards.set(id, card);
    }
    return [...cards.values()];
  }
}
