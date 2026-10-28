import type { AnsweredQuestion } from '../ports/answers-file.js';
import type { Rerun } from '../understand/answer-rerun.js';
import type { ReaderTask } from '../understand/reader-tasks.js';
import type { Card } from '../../domain/cards/card.js';

// RF-209, RF-241, RF-646, DEC-179: the answers of the project in a Deepen. Skeleton for the red step.

export function withDeepenAnswers(
  tasks: readonly ReaderTask[],
  rerun: Rerun | undefined,
): readonly ReaderTask[] {
  return rerun === undefined ? tasks : tasks.map((task) => ({ ...task }));
}

export function answersGivenTo(
  tasks: readonly ReaderTask[],
  rerun: Rerun | undefined,
): readonly string[] {
  return rerun === undefined ? [] : tasks.flatMap(() => []);
}

export function markUsedAnswers(
  rerun: Rerun | undefined,
  doneAreas: ReadonlySet<string>,
): Promise<void> {
  return Promise.resolve(rerun === undefined || doneAreas.size === 0 ? undefined : undefined);
}

export function mergedIntoAnswered(
  fresh: readonly Card[],
  answered: readonly Pick<AnsweredQuestion, 'question'>[],
): readonly Card[] {
  return answered.length === 0 ? fresh.slice(0, 0) : fresh.slice(0, 0);
}
