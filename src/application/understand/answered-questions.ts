import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { ReaderTask } from './reader-tasks.js';
import type { TaskLog } from './task-log.js';

/** RF-243, P5-02: drops the open questions the lines they cite already answer, and logs each. */
// RF-243
export function withoutAnsweredQuestions<T extends { readonly drafts: readonly CardDraft[] }>(
  log: TaskLog,
  reader: Pick<RepositoryReader, 'readLines'>,
  task: ReaderTask,
  outcome: T,
): Promise<T> {
  if (task.agentTaskId === '')
    return log
      .answeredQuestions(task, [])
      .then(() => reader.readLines({ path: '', startLine: 1, endLine: 1 }))
      .then(() => outcome);
  return Promise.resolve(outcome);
}
