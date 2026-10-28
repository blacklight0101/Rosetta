import type { Card } from '../../domain/cards/card.js';
import type { AnsweredQuestion } from '../ports/answers-file.js';
import { markAnswered, withAnswersOf, type Rerun } from '../understand/answer-rerun.js';
import { questionWords } from '../understand/open-questions.js';
import type { ReaderTask } from '../understand/reader-tasks.js';

// RF-209, RF-241, RF-646, DEC-179, ADR-013: the answers of the project in a Deepen. Every reader task
// of a Deepen gets the answered questions of its area as user context, through the code of the
// re-run with answers (`withAnswersOf`: the same labelled block of the same prompt, which says an
// answer is context and never evidence). The questions it used are marked `Answered` once the task
// of their area ended `Done`, and a new open question that asks the same as an answered one is merged
// into it, so the answered question is never asked again.

// RF-209, RF-241
export function withDeepenAnswers(
  tasks: readonly ReaderTask[],
  rerun: Rerun | undefined,
): readonly ReaderTask[] {
  return rerun === undefined ? tasks : withAnswersOf(tasks, rerun.plan);
}

/** The questions (`<run folder>/<card id>`, each once, in order) the tasks give to their readers. */
export function answersGivenTo(
  tasks: readonly ReaderTask[],
  rerun: Rerun | undefined,
): readonly string[] {
  if (rerun === undefined) return [];
  const areas = new Set(tasks.map((task) => task.area.name));
  const given = rerun.plan.pending
    .filter((question) => areas.has(question.area))
    .map((question) => `${question.runKey}/${question.cardId}`);
  return [...new Set(given)].sort();
}

/** RF-241: marks the questions of the areas whose task ended `Done` as `Answered`. */
export async function markUsedAnswers(
  rerun: Rerun | undefined,
  doneAreas: ReadonlySet<string>,
): Promise<void> {
  if (rerun === undefined) return;
  await markAnswered(rerun.deps, rerun.plan, doneAreas);
}

/** RF-646, Q-52: the open questions among the cards that ask the same as an answered question. */
export function mergedIntoAnswered(
  fresh: readonly Card[],
  answered: readonly Pick<AnsweredQuestion, 'question'>[],
): readonly Card[] {
  const asked = new Set(answered.map((each) => questionWords(each.question)));
  return fresh.filter((card) => {
    const words = questionWords(card.question ?? card.title);
    return card.type === 'OQ' && words !== '' && asked.has(words);
  });
}
