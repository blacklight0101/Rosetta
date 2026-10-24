import { parse } from 'yaml';
import { z } from 'zod';
import type { ProjectRef } from '../../application/ports/answers-file.js';
import type {
  FileStatReader,
  OutputWriter,
  WorkspaceFile,
} from '../../application/ports/output-writer.js';
import type {
  PriorCard,
  PriorCards,
  QuestionReopener,
} from '../../application/ports/prior-cards.js';
import {
  CARD_TYPES,
  type CardType,
  type OpenQuestionState,
} from '../../domain/cards/card-vocabulary.js';
import { KeptFileParse } from '../files/kept-file-parse.js';
import { isRunKey, runPath } from '../files/workspace-paths.js';

// RF-241, data-model.md sections 3.7 and 3.16: the cards of an earlier run read back from their files
// (the YAML header is the data), and the one edit a re-run makes to them: the state of an answered
// `OQ` card, in its header and in the `State:` line of its body. A run that is gone, a file that
// cannot be read or a header that does not parse counts as no card: the caller skips what it cannot
// find. Run keys and card ids are checked here too, because they come from a file a person can edit.

const indexSchema = z.object({ cards: z.array(z.object({ path: z.string() })) });
const headerSchema = z.object({
  id: z.string(),
  type: z.enum(CARD_TYPES),
  title: z.string(),
  area: z.string(),
  claims: z.array(z.object({ text: z.string(), citations: z.array(z.string()).optional() })),
  questionState: z.enum(['Open', 'Answered']).optional(),
  question: z.string().optional(),
  mergedFrom: z.array(z.string()).optional(),
});

const HEADER_END = '\n---\n';
const cardFile = new RegExp(`^cards/(?:${CARD_TYPES.join('|')})/[A-Z]+-[0-9]+\\.md$`, 'u');
const cardId = /^OQ-\d+$/u;

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** RF-1017: the file of each citation `path:a-b` (the path ends at the last colon), each once. */
function citedFiles(citations: readonly string[]): readonly string[] {
  const files = citations.flatMap((citation) => {
    const colon = citation.lastIndexOf(':');
    return colon > 0 && /^\d+(?:-\d+)?$/u.test(citation.slice(colon + 1))
      ? [citation.slice(0, colon)]
      : [];
  });
  return [...new Set(files)];
}

function headerOf(text: string): PriorCard | undefined {
  if (!text.startsWith('---\n')) return undefined;
  const end = text.indexOf(HEADER_END, 4);
  if (end < 0) return undefined;
  let data: unknown;
  try {
    data = parse(text.slice(4, end));
  } catch {
    return undefined;
  }
  const header = headerSchema.safeParse(data);
  if (!header.success) return undefined;
  const { claims, questionState, question, mergedFrom, ...rest } = header.data;
  const state = questionState === undefined ? {} : { questionState };
  const asked = question === undefined ? {} : { question };
  const merged = mergedFrom === undefined ? {} : { mergedFrom };
  const cited = citedFiles(claims.flatMap((claim) => claim.citations ?? []));
  return {
    ...rest,
    ...state,
    ...asked,
    ...merged,
    claims: claims.map((claim) => claim.text),
    cited,
  };
}

/** The text with the state of the question card changed, or undefined when it is not in `from`. */
function withState(
  text: string,
  from: OpenQuestionState,
  to: OpenQuestionState,
): string | undefined {
  const end = text.indexOf(HEADER_END, 4);
  if (!text.startsWith('---\n') || end < 0) return undefined;
  const header = text.slice(0, end);
  const body = text.slice(end);
  if (!header.includes(`\nquestionState: "${from}"`) || !body.includes(`\nState: ${from}\n`)) {
    return undefined;
  }
  const moved = header.replace(`\nquestionState: "${from}"`, `\nquestionState: "${to}"`);
  return `${moved}${body.replace(`\nState: ${from}\n`, `\nState: ${to}\n`)}`;
}

export class FilePriorCards implements PriorCards, QuestionReopener {
  private readonly writer: OutputWriter;
  private readonly indexes: KeptFileParse<z.infer<typeof indexSchema> | undefined>;
  private readonly files: KeptFileParse<PriorCard | undefined>;

  /** With a `stats` reader (P5-28) each card file is parsed once per version and kept. */
  constructor(writer: OutputWriter, stats?: FileStatReader) {
    this.writer = writer;
    this.indexes = new KeptFileParse(writer, stats, 64);
    this.files = new KeptFileParse(writer, stats);
  }

  // RF-241
  async cardsOf(
    project: ProjectRef,
    runKey: string,
    types?: readonly CardType[],
  ): Promise<readonly PriorCard[]> {
    if (!isRunKey(runKey)) return [];
    const read = await this.indexes.read(
      this.fileOf(project, runKey, 'cards/index.json'),
      (text) => {
        const index = indexSchema.safeParse(parsedJson(text));
        return index.success ? index.data : undefined;
      },
    );
    if (!read.ok || read.value === undefined) return [];
    const paths = read.value.cards
      .map((card) => card.path)
      .filter((path) => cardFile.test(path))
      .filter(
        (path) => types === undefined || types.some((type) => path.startsWith(`cards/${type}/`)),
      );
    const found = await Promise.all(
      paths.map((path) => this.files.read(this.fileOf(project, runKey, path), headerOf)),
    );
    return found.flatMap((card) => (card.ok && card.value !== undefined ? [card.value] : []));
  }

  // RF-241
  markAnswered(
    project: ProjectRef,
    runKey: string,
    cardIds: readonly string[],
  ): Promise<readonly string[]> {
    return this.change(project, runKey, cardIds, ['Open', 'Answered']);
  }

  // RF-241
  reopen(
    project: ProjectRef,
    runKey: string,
    cardIds: readonly string[],
  ): Promise<readonly string[]> {
    return this.change(project, runKey, cardIds, ['Answered', 'Open']);
  }

  /** Moves these `OQ` cards of the run from the first state to the second; the ids it moved. */
  private async change(
    project: ProjectRef,
    runKey: string,
    cardIds: readonly string[],
    [from, to]: readonly [OpenQuestionState, OpenQuestionState],
  ): Promise<readonly string[]> {
    if (!isRunKey(runKey)) return [];
    const moved: string[] = [];
    for (const id of cardIds.filter((each) => cardId.test(each))) {
      const path = `cards/OQ/${id}.md`;
      const text = await this.read(project, runKey, path);
      const changed = text === undefined ? undefined : withState(text, from, to);
      if (changed === undefined) continue;
      const written = await this.writer.writeText(this.fileOf(project, runKey, path), changed);
      if (written.ok) moved.push(id);
    }
    return moved;
  }

  private fileOf(project: ProjectRef, runKey: string, path: string): WorkspaceFile {
    return { userId: project.userId, path: `${runPath(project.projectId, runKey)}/${path}` };
  }

  private async read(
    project: ProjectRef,
    runKey: string,
    path: string,
  ): Promise<string | undefined> {
    const read = await this.writer.readText(this.fileOf(project, runKey, path));
    return read.ok ? read.value : undefined;
  }
}
