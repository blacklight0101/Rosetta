import { parse } from 'yaml';
import { z } from 'zod';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { ReportCardFiles } from '../../application/ports/report-card-files.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { CardFile, CardFileClaim } from '../../application/report/card-evidence.js';
import { CARD_TYPES, CLAIM_STATUSES, CONFIDENCES } from '../../domain/cards/card-vocabulary.js';
import { parseCitation, type Citation } from '../../domain/cards/citation.js';
import { runPath } from '../files/workspace-paths.js';

// RF-502, data-model.md section 3.7: the card files of a run read for the pages of the report. The
// YAML header is the data. A person can edit the files, so the path, the header and every citation
// are checked; a file that does not read is left out (its card keeps its row in the report but gets
// no page) instead of being half read.

const claimSchema = z.object({
  claimId: z.string().regex(/^[A-Z]+-\d+\.c\d+$/u),
  text: z.string(),
  citations: z.array(z.string()),
  status: z.enum(CLAIM_STATUSES),
  verdict: z.object({ reason: z.string() }).optional(),
});

const headerSchema = z.object({
  id: z.string().regex(/^[A-Z]+-\d+$/u),
  type: z.enum(CARD_TYPES),
  title: z.string(),
  summary: z.string(),
  area: z.string(),
  confidence: z.enum(CONFIDENCES),
  claims: z.array(claimSchema),
  question: z.string().optional(),
  whyItMatters: z.string().optional(),
  questionState: z.enum(['Open', 'Answered']).optional(),
  note: z.string().optional(),
});

const cardFile = new RegExp(`^cards/(?:${CARD_TYPES.join('|')})/[A-Z]+-[0-9]+\\.md$`, 'u');
const HEADER_END = '\n---\n';

function citationsOf(texts: readonly string[]): Citation[] | undefined {
  const citations: Citation[] = [];
  for (const text of texts) {
    const parsed = parseCitation(text);
    if (!parsed.ok) return undefined;
    citations.push(parsed.value);
  }
  return citations;
}

function headerOf(text: string): unknown {
  const end = text.indexOf(HEADER_END, 4);
  if (!text.startsWith('---\n') || end < 0) return undefined;
  try {
    const header: unknown = parse(text.slice(4, end));
    return header;
  } catch {
    // A header that is not YAML is no card: the report gives it no page.
    return undefined;
  }
}

/** The fields of a card that are left out when the header has none. */
function optionalFields(header: z.infer<typeof headerSchema>): Partial<CardFile> {
  const { question, whyItMatters, questionState, note } = header;
  return {
    ...(question === undefined ? {} : { question }),
    ...(whyItMatters === undefined ? {} : { whyItMatters }),
    ...(questionState === undefined ? {} : { questionState }),
    ...(note === undefined ? {} : { note }),
  };
}

function claimsOf(header: z.infer<typeof headerSchema>): CardFile['claims'] | undefined {
  const claims: CardFileClaim[] = [];
  for (const claim of header.claims) {
    const citations = citationsOf(claim.citations);
    if (citations === undefined) return undefined;
    const { claimId, text, status, verdict } = claim;
    claims.push({
      claimId,
      text,
      status,
      citations,
      ...(verdict ? { reason: verdict.reason } : {}),
    });
  }
  return claims;
}

function cardOf(text: string): CardFile | undefined {
  const parsed = headerSchema.safeParse(headerOf(text));
  if (!parsed.success) return undefined;
  const header = parsed.data;
  const claims = claimsOf(header);
  if (claims === undefined) return undefined;
  const { id, type, title, summary, area, confidence } = header;
  return { id, type, title, summary, area, confidence, ...optionalFields(header), claims };
}

export class FileReportCards implements ReportCardFiles {
  private readonly writer: OutputWriter;

  constructor(writer: OutputWriter) {
    this.writer = writer;
  }

  // RF-502
  async read(scope: RunScope, paths: readonly string[]): Promise<readonly CardFile[]> {
    const cards: CardFile[] = [];
    for (const name of paths) {
      if (!cardFile.test(name)) continue;
      const read = await this.writer.readText({
        userId: scope.userId,
        path: `${runPath(scope.projectId, scope.runKey)}/${name}`,
      });
      const card = read.ok ? cardOf(read.value) : undefined;
      if (card !== undefined) cards.push(card);
    }
    return cards;
  }
}
