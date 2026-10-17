import { parse } from 'yaml';
import { z } from 'zod';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { CARD_TYPES, CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
import { parseCitation } from '../../domain/cards/citation.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { EvaluatedClaim } from '../../domain/eval/claim-match.js';
import { runPath } from '../files/workspace-paths.js';

// RNF-006, RNF-012, data-model.md sections 3.7 and 3.12: what the evaluation reads back from an
// ended understand run: every claim of the card files listed by `cards/index.json` (the YAML header
// is the data, after the judgement step and consolidation), and the total of `cost.json`. Both are
// files Rosetta wrote; a card that does not read is an error that stops the evaluation, so a
// result never silently leaves claims out. A run that wrote no cards or no cost report has none.

const indexSchema = z.object({ cards: z.array(z.object({ path: z.string() })) });
const headerSchema = z.object({
  type: z.enum(CARD_TYPES),
  title: z.string(),
  claims: z.array(
    z.object({
      claimId: z.string(),
      text: z.string(),
      citations: z.array(z.string()),
      status: z.enum(CLAIM_STATUSES),
    }),
  ),
});
const costSchema = z.object({ totals: z.object({ costMicros: z.number().int().min(0) }) });

const cardFile = new RegExp(`^cards/(?:${CARD_TYPES.join('|')})/[A-Z]+-[0-9]+\\.md$`, 'u');
const HEADER_END = '\n---\n';

function unreadable(what: string, cause?: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.unexpected, `The evaluation cannot read ${what}.`, { cause });
}

async function readRunFile(
  writer: OutputWriter,
  scope: RunScope,
  name: string,
): Promise<string | undefined> {
  const path = `${runPath(scope.projectId, scope.runKey)}/${name}`;
  const read = await writer.readText({ userId: scope.userId, path });
  if (read.ok) return read.value;
  if (read.error.reason === 'not-found') return undefined;
  throw unreadable(name);
}

function jsonOf(text: string, name: string): unknown {
  try {
    const data: unknown = JSON.parse(text);
    return data;
  } catch (error) {
    throw unreadable(name, error);
  }
}

function claimsOf(text: string, path: string): EvaluatedClaim[] {
  const end = text.indexOf(HEADER_END, 4);
  if (!text.startsWith('---\n') || end < 0) throw unreadable(path);
  let header;
  try {
    header = headerSchema.parse(parse(text.slice(4, end)));
  } catch (error) {
    throw unreadable(path, error);
  }
  const { type, title } = header;
  return header.claims.map((claim) => ({
    ...{ claimId: claim.claimId, cardType: type, cardTitle: title, text: claim.text },
    status: claim.status,
    citations: claim.citations.map((citation) => {
      const parsed = parseCitation(citation);
      if (!parsed.ok) throw unreadable(`${path} (citation ${citation})`);
      return parsed.value;
    }),
  }));
}

// RNF-006
export async function readRunClaims(
  writer: OutputWriter,
  scope: RunScope,
): Promise<EvaluatedClaim[]> {
  const index = await readRunFile(writer, scope, 'cards/index.json');
  if (index === undefined) return [];
  const parsed = indexSchema.safeParse(jsonOf(index, 'cards/index.json'));
  if (!parsed.success) throw unreadable('cards/index.json');
  const claims: EvaluatedClaim[] = [];
  for (const { path } of parsed.data.cards) {
    if (!cardFile.test(path)) throw unreadable(`${path}, which is not a card file of the run`);
    const text = await readRunFile(writer, scope, path);
    if (text === undefined) throw unreadable(path);
    claims.push(...claimsOf(text, path));
  }
  return claims;
}

// RNF-012
export async function readRunCost(writer: OutputWriter, scope: RunScope): Promise<number | null> {
  const text = await readRunFile(writer, scope, 'cost.json');
  if (text === undefined) return null;
  const parsed = costSchema.safeParse(jsonOf(text, 'cost.json'));
  if (!parsed.success) throw unreadable('cost.json');
  return parsed.data.totals.costMicros;
}
