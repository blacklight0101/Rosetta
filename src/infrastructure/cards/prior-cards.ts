import { parse } from 'yaml';
import { z } from 'zod';
import type { ProjectRef } from '../../application/ports/answers-file.js';
import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import type {
  PriorCard,
  PriorCards,
  QuestionReopener,
} from '../../application/ports/prior-cards.js';
import { CARD_TYPES } from '../../domain/cards/card-vocabulary.js';
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
  claims: z.array(z.object({ text: z.string() })),
  questionState: z.enum(['Open', 'Answered']).optional(),
  question: z.string().optional(),
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
  const { claims, questionState, question, ...rest } = header.data;
  const state = questionState === undefined ? {} : { questionState };
  const asked = question === undefined ? {} : { question };
  return { ...rest, ...state, ...asked, claims: claims.map((claim) => claim.text) };
}

/** The text with the state of the card changed, or undefined when it is not an open question. */
function answered(text: string): string | undefined {
  const end = text.indexOf(HEADER_END, 4);
  if (!text.startsWith('---\n') || end < 0) return undefined;
  const header = text.slice(0, end);
  const body = text.slice(end);
  if (!header.includes('\nquestionState: "Open"') || !body.includes('\nState: Open\n')) {
    return undefined;
  }
  return `${header.replace('\nquestionState: "Open"', '\nquestionState: "Answered"')}${body.replace(
    '\nState: Open\n',
    '\nState: Answered\n',
  )}`;
}

export class FilePriorCards implements PriorCards, QuestionReopener {
  private readonly writer: OutputWriter;

  constructor(writer: OutputWriter) {
    this.writer = writer;
  }

  // RF-241
  async cardsOf(project: ProjectRef, runKey: string): Promise<readonly PriorCard[]> {
    if (!isRunKey(runKey)) return [];
    const index = indexSchema.safeParse(
      parsedJson((await this.read(project, runKey, 'cards/index.json')) ?? ''),
    );
    if (!index.success) return [];
    const paths = index.data.cards.map((card) => card.path).filter((path) => cardFile.test(path));
    const texts = await Promise.all(paths.map((path) => this.read(project, runKey, path)));
    return texts.flatMap((text) => {
      const card = text === undefined ? undefined : headerOf(text);
      return card === undefined ? [] : [card];
    });
  }

  // RF-241
  async markAnswered(
    project: ProjectRef,
    runKey: string,
    cardIds: readonly string[],
  ): Promise<readonly string[]> {
    if (!isRunKey(runKey)) return [];
    const marked: string[] = [];
    for (const id of cardIds.filter((each) => cardId.test(each))) {
      const path = `cards/OQ/${id}.md`;
      const text = await this.read(project, runKey, path);
      const changed = text === undefined ? undefined : answered(text);
      if (changed === undefined) continue;
      const written = await this.writer.writeText(this.fileOf(project, runKey, path), changed);
      if (written.ok) marked.push(id);
    }
    return marked;
  }

  // RF-241
  reopen(): Promise<readonly string[]> {
    return Promise.resolve([]);
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
