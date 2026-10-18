import { parse } from 'yaml';
import { z } from 'zod';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunCards } from '../../application/ports/run-cards.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { CARD_TYPES, CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
import { parseCitation, type Citation } from '../../domain/cards/citation.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import { runPath } from '../files/workspace-paths.js';

// RF-604, data-model.md section 3.7: the cards of an ended understand run read back for `plan`: the
// card files `cards/index.json` lists, whose YAML header is the data (the claims with their status
// after the judgement step and consolidation). The files were written by Rosetta, but a person can
// edit them, so the paths, the header and every citation are checked; a card that does not read
// rejects the whole read (RST-1802), so a plan never silently leaves claims out.

const indexSchema = z.object({ cards: z.array(z.object({ path: z.string() })) });
// RF-626: a screen's validations stay in the card file; the plan needs the rest.
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const screenSchema = z.object({
  route: z.string(),
  roles: z.array(z.string()).default([]),
  fields: z
    .array(z.object({ name: z.string(), inputKind: z.string(), required: z.boolean() }))
    .default([]),
  actions: z
    .array(z.object({ label: z.string(), handler: optionalText, flow: optionalText }))
    .default([]),
  leadsTo: z.array(z.string()).default([]),
});
const headerSchema = z.object({
  id: z.string().regex(/^[A-Z]+-\d+$/u),
  type: z.enum(CARD_TYPES),
  title: z.string(),
  summary: z.string(),
  area: z.string(),
  flow: z.object({ trigger: z.string(), outcome: z.string() }).optional(),
  screen: screenSchema.optional(),
  claims: z.array(
    z.object({
      claimId: z.string(),
      text: z.string(),
      citations: z.array(z.string()),
      status: z.enum(CLAIM_STATUSES),
      target: z.string().optional(),
    }),
  ),
});

const cardFile = new RegExp(`^cards/(?:${CARD_TYPES.join('|')})/[A-Z]+-[0-9]+\\.md$`, 'u');
const HEADER_END = '\n---\n';

function unreadable(what: string, cause?: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.planSourceMissing, `The cards cannot be read: ${what}.`, {
    cause,
  });
}

function citationOf(text: string, path: string): Citation {
  const parsed = parseCitation(text);
  if (!parsed.ok) throw unreadable(`${path} has a citation that does not read`);
  return parsed.value;
}

function cardOf(text: string, path: string): SourceCard {
  const end = text.indexOf(HEADER_END, 4);
  if (!text.startsWith('---\n') || end < 0) throw unreadable(`${path} has no header`);
  let header;
  try {
    header = headerSchema.parse(parse(text.slice(4, end)));
  } catch (error) {
    throw unreadable(`${path} has a header that does not read`, error);
  }
  return {
    ...header,
    claims: header.claims.map((claim) => ({
      ...claim,
      citations: claim.citations.map((citation) => citationOf(citation, path)),
    })),
  };
}

function jsonOf(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    throw unreadable('cards/index.json is not JSON', error);
  }
}

export class FileRunCards implements RunCards {
  private readonly writer: OutputWriter;

  constructor(writer: OutputWriter) {
    this.writer = writer;
  }

  // RF-604
  async cardsOf(scope: RunScope): Promise<readonly SourceCard[]> {
    const index = await this.read(scope, 'cards/index.json');
    if (index === undefined) return [];
    const parsed = indexSchema.safeParse(jsonOf(index));
    if (!parsed.success) throw unreadable('cards/index.json has another shape');
    const cards: SourceCard[] = [];
    for (const { path } of parsed.data.cards) {
      if (!cardFile.test(path)) throw unreadable(`${path} is not a card file of the run`);
      const text = await this.read(scope, path);
      if (text === undefined) throw unreadable(`${path} is missing`);
      cards.push(cardOf(text, path));
    }
    return cards;
  }

  private async read(scope: RunScope, name: string): Promise<string | undefined> {
    const path = `${runPath(scope.projectId, scope.runKey)}/${name}`;
    const read = await this.writer.readText({ userId: scope.userId, path });
    if (read.ok) return read.value;
    if (read.error.reason === 'not-found') return undefined;
    throw unreadable(`${name} could not be read (${read.error.code})`);
  }
}
