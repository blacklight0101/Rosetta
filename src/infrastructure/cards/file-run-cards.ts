import { parse } from 'yaml';
import { z } from 'zod';
import type {
  FileStatReader,
  OutputWriter,
  WorkspaceFile,
} from '../../application/ports/output-writer.js';
import type { RunCards } from '../../application/ports/run-cards.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { CARD_TYPES, CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
import { parseCitation, type Citation } from '../../domain/cards/citation.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import { KeptFileParse } from '../files/kept-file-parse.js';
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
  mergedFrom: z.array(z.string().regex(/^[A-Z]+-\d+$/u)).optional(),
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
/** Card files read at once (P5-22). */
const READ_BATCH = 24;

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

export interface FileRunCardsOptions {
  /** How many card files are kept parsed (P5-28). */
  readonly filesKept?: number;
}

/** The paths the index lists, checked to be card files of the run. */
function pathsOf(index: string): readonly string[] {
  const parsed = indexSchema.safeParse(jsonOf(index));
  if (!parsed.success) throw unreadable('cards/index.json has another shape');
  const paths = parsed.data.cards.map((card) => card.path);
  for (const path of paths) {
    if (!cardFile.test(path)) throw unreadable(`${path} is not a card file of the run`);
  }
  return paths;
}

export class FileRunCards implements RunCards {
  private readonly indexes: KeptFileParse<readonly string[]>;
  private readonly files: KeptFileParse<SourceCard>;

  /**
   * With a `stats` reader (P5-28) each card file is parsed once per version (size and modification
   * time) and the parse is kept for the next read, shared by every caller of this instance.
   */
  constructor(writer: OutputWriter, stats?: FileStatReader, options: FileRunCardsOptions = {}) {
    this.indexes = new KeptFileParse(writer, stats, 64);
    this.files = new KeptFileParse(writer, stats, options.filesKept);
  }

  // RF-604
  async cardsOf(scope: RunScope): Promise<readonly SourceCard[]> {
    const index = await this.indexes.read(this.fileOf(scope, 'cards/index.json'), pathsOf);
    if (!index.ok) {
      if (index.error.reason === 'not-found') return [];
      throw unreadable(`cards/index.json could not be read (${index.error.code})`);
    }
    const paths = index.value;
    // P5-22: the files are read a batch at a time, so a run of hundreds of cards does not wait on
    // each file in turn; the cards keep the order of the index.
    const cards: SourceCard[] = [];
    for (let start = 0; start < paths.length; start += READ_BATCH) {
      const batch = paths.slice(start, start + READ_BATCH);
      const found = await Promise.all(
        batch.map((path) =>
          this.files.read(this.fileOf(scope, path), (text) => cardOf(text, path)),
        ),
      );
      for (const [at, card] of found.entries()) {
        const path = batch[at] ?? '';
        if (card.ok) cards.push(card.value);
        else if (card.error.reason === 'not-found') throw unreadable(`${path} is missing`);
        else throw unreadable(`${path} could not be read (${card.error.code})`);
      }
    }
    return cards;
  }

  private fileOf(scope: RunScope, name: string): WorkspaceFile {
    return { userId: scope.userId, path: `${runPath(scope.projectId, scope.runKey)}/${name}` };
  }
}
