import type { CardDraft } from '../../domain/cards/card-ids.js';
import { withoutLibraryDescriptions, withoutQuestions } from './area-notes.js';
import type { ReaderTask } from './reader-tasks.js';
import type { TaskLog } from './task-log.js';

/**
 * RF-243, P3-123: an area of third-party code writes no open question and no FEAT or BR card that
 * only says it holds library code, whatever its agent answered.
 */
// RF-243
export async function withoutThirdPartyQuestions<
  T extends { readonly drafts: readonly CardDraft[] },
>(log: TaskLog, thirdParty: ReadonlySet<string>, task: ReaderTask, outcome: T): Promise<T> {
  if (!thirdParty.has(task.area.name)) return outcome;
  const drafts = withoutLibraryDescriptions(withoutQuestions(outcome.drafts));
  if (drafts.length === outcome.drafts.length) return outcome;
  await log.thirdPartyQuestions(task);
  return { ...outcome, drafts };
}
