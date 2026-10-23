import type { CardDraft } from '../../domain/cards/card-ids.js';
import { nameAnsweredByCitedLines } from '../../domain/cards/open-question-answered.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { ReaderTask } from './reader-tasks.js';
import type { RefusedQuestion, TaskLog } from './task-log.js';

/** The cited range that defines the name a question asks about, with the name; a range that cannot be read adds nothing (the question stands). */
async function refusalOf(
  reader: Pick<RepositoryReader, 'readLines'>,
  draft: CardDraft,
): Promise<RefusedQuestion | undefined> {
  const { question } = draft;
  if (draft.type !== 'OQ' || question === undefined) return undefined;
  for (const { citations } of draft.claims) {
    for (const { path, startLine, endLine } of citations) {
      const read = await reader.readLines({ path, startLine, endLine }).catch(() => undefined);
      if (read?.ok !== true) continue;
      const name = nameAnsweredByCitedLines(question, read.value.lines.join('\n'));
      if (name === undefined) continue;
      return { question, name, citation: `${path}:${String(startLine)}-${String(endLine)}` };
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
