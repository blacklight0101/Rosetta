import type { Card } from '../../domain/cards/card.js';
import type { AnswersFile } from '../ports/answers-file.js';
import { mergedQuestionsOf, openQuestionsOf, type MergedQuestion } from './open-questions.js';

// RF-243, RF-646, EV-57, P8-05: an event for each question `sameQuestion` merged into another, so the
// report can list the pairs and a wrong merge can be spotted.

/** The part of the run's event publisher the merged questions need. */
export interface MergedQuestionEvents {
  emit(type: 'question.merged', data: Readonly<Record<string, unknown>>): Promise<unknown>;
}

/** One `question.merged` event for each pair. */
export async function publishMergedQuestions(
  events: MergedQuestionEvents,
  pairs: readonly MergedQuestion[],
): Promise<void> {
  for (const pair of pairs) await events.emit('question.merged', { ...pair });
}

/** The pairs among the open questions of one run's cards. */
export async function publishRunMerges(
  events: MergedQuestionEvents,
  cards: readonly Card[],
  runKey: string,
): Promise<void> {
  await publishMergedQuestions(events, mergedQuestionsOf(cards, runKey));
}

/** DEC-98: a run's open questions go to the project's `answers.md`; the pairs it merged are published. */
export async function addRunQuestions(
  parts: {
    readonly deps: { readonly answers: Pick<AnswersFile, 'addQuestions'> };
    readonly execution: {
      readonly run: {
        readonly runKey: string;
        readonly userId: string;
        readonly projectId: string;
      };
      readonly events: MergedQuestionEvents;
    };
  },
  cards: readonly Card[],
): Promise<void> {
  const { run } = parts.execution;
  await publishRunMerges(parts.execution.events, cards, run.runKey);
  const questions = openQuestionsOf(cards, run.runKey);
  if (questions.length === 0) return;
  await parts.deps.answers.addQuestions(
    { userId: run.userId, projectId: run.projectId },
    questions,
  );
}
