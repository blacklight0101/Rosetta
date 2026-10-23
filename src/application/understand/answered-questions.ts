import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { Citation } from '../../domain/cards/citation.js';
import { nameAnsweredByCitedLines } from '../../domain/cards/open-question-answered.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { ReaderTask } from './reader-tasks.js';
import type { RefusedQuestion, TaskLog } from './task-log.js';

/** The lines the draft's claims cite, joined; a range that cannot be read adds nothing (the question stands). */
async function citedText(
  reader: Pick<RepositoryReader, 'readLines'>,
  citations: readonly Citation[],
): Promise<string> {
  const texts: string[] = [];
  for (const { path, startLine, endLine } of citations) {
    const read = await reader.readLines({ path, startLine, endLine }).catch(() => undefined);
    if (read?.ok === true) texts.push(read.value.lines.join('\n'));
  }
  return texts.join('\n');
}

async function refusalOf(
  reader: Pick<RepositoryReader, 'readLines'>,
  draft: CardDraft,
): Promise<RefusedQuestion | undefined> {
  if (draft.type !== 'OQ' || draft.question === undefined) return undefined;
  for (const claim of draft.claims) {
    const name = nameAnsweredByCitedLines(draft.question, await citedText(reader, claim.citations));
    const cited = claim.citations[0];
    if (name !== undefined && cited !== undefined) {
      const { path, startLine, endLine } = cited;
      return {
        question: draft.question,
        name,
        citation: `${path}:${String(startLine)}-${String(endLine)}`,
      };
    }
  }
  return undefined;
}

/**
 * RF-243, P5-02, EV-09: drops the open questions the lines they cite already answer, and logs each
 * with the name found and its citation, so none is lost silently (DEC-19).
 */
// RF-243
export async function withoutAnsweredQuestions<T extends { readonly drafts: readonly CardDraft[] }>(
  log: TaskLog,
  reader: Pick<RepositoryReader, 'readLines'>,
  task: ReaderTask,
  outcome: T,
): Promise<T> {
  const refused: RefusedQuestion[] = [];
  const drafts: CardDraft[] = [];
  for (const draft of outcome.drafts) {
    const refusal = await refusalOf(reader, draft);
    if (refusal === undefined) drafts.push(draft);
    else refused.push(refusal);
  }
  if (refused.length === 0) return outcome;
  await log.answeredQuestions(task, refused);
  return { ...outcome, drafts };
}
