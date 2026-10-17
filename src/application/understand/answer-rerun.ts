import type { AnsweredQuestion, AnswersFile, ProjectRef } from '../ports/answers-file.js';
import type { PriorCard, PriorCards } from '../ports/prior-cards.js';
import type { Card } from '../../domain/cards/card.js';
import { compareCards, type CardChanges } from './card-changes.js';
import { questionWords } from './open-questions.js';
import type { ReaderTask } from './reader-tasks.js';

// RF-241, RF-1007, DEC-15: the re-run with answers. The answered questions of the project's
// `answers.md` are matched with the `OQ` cards of the runs that raised them; a question whose card
// is gone, is already `Answered`, or whose area is not in the code map is left out. The areas of the
// questions left are the affected areas. The answers go to the reader of their area, and once that
// reader's task has ended `Done` its questions are marked `Answered`. A question that several areas
// asked is one question in `answers.md` (DEC-136) but has an `OQ` card in each area: every one of
// those cards is matched, its area is read again with the answer, and its card is marked.

export interface RerunDependencies {
  readonly answers: Pick<AnswersFile, 'answeredQuestions'>;
  readonly cards: PriorCards;
}

/** An answered question with the area of its card. */
interface PendingQuestion extends AnsweredQuestion {
  readonly area: string;
}

/** Why an answered question is not used by the re-run. */
export type SkipReason = 'run-gone' | 'card-gone' | 'already-answered' | 'area-not-in-code-map';

/** An answered question the re-run leaves out. */
export interface SkippedQuestion {
  readonly cardId: string;
  readonly runKey: string;
  readonly reason: SkipReason;
}

export interface RerunPlan {
  readonly project: ProjectRef;
  readonly pending: readonly PendingQuestion[];
  /** The answered questions left out, each with its reason; the run logs them. */
  readonly skipped: readonly SkippedQuestion[];
  /** The earlier cards of the runs that raised the questions, to tell new from changed cards. */
  readonly baseline: readonly PriorCard[];
}

/** A re-run with answers: what it compares with and marks. */
export interface Rerun {
  readonly deps: RerunDependencies;
  readonly plan: RerunPlan;
}

/** The earlier cards of the run, by run key, for the runs the questions came from. */
async function cardsByRun(
  deps: RerunDependencies,
  project: ProjectRef,
  answered: readonly AnsweredQuestion[],
): Promise<Map<string, readonly PriorCard[]>> {
  const keys = [...new Set(answered.map((question) => question.runKey))];
  const cards = await Promise.all(keys.map((key) => deps.cards.cardsOf(project, key)));
  return new Map(keys.map((key, index) => [key, cards[index] ?? []]));
}

/** Every `OQ` card of the run that asks the same question as this one, this one included. */
function askingTheSame(card: PriorCard, earlier: readonly PriorCard[]): readonly PriorCard[] {
  const words = questionWords(card.question ?? card.title);
  return earlier.filter(
    (each) =>
      each.id === card.id ||
      (each.type === 'OQ' && words !== '' && questionWords(each.question ?? each.title) === words),
  );
}

/** The cards that use the answer, or why the question cannot be used. */
function cardsOrReason(
  question: AnsweredQuestion,
  earlier: readonly PriorCard[],
  codeMapAreas: readonly string[],
): { readonly cards: readonly PriorCard[] } | { readonly reason: SkipReason } {
  if (earlier.length === 0) return { reason: 'run-gone' };
  const card = earlier.find((each) => each.id === question.cardId && each.type === 'OQ');
  if (card === undefined) return { reason: 'card-gone' };
  if (card.questionState === 'Answered') return { reason: 'already-answered' };
  const usable = askingTheSame(card, earlier).filter(
    (each) => each.questionState !== 'Answered' && codeMapAreas.includes(each.area),
  );
  return usable.length === 0 ? { reason: 'area-not-in-code-map' } : { cards: usable };
}

// RF-241
export async function planRerun(
  deps: RerunDependencies,
  project: ProjectRef,
  codeMapAreas: readonly string[],
): Promise<RerunPlan> {
  const answered = await deps.answers.answeredQuestions(project);
  const byRun = await cardsByRun(deps, project, answered);
  const pending: PendingQuestion[] = [];
  const skipped: SkippedQuestion[] = [];
  for (const question of answered) {
    const found = cardsOrReason(question, byRun.get(question.runKey) ?? [], codeMapAreas);
    if ('cards' in found) {
      // Two sections of one run can stand for the same question; a card is used once.
      const fresh = found.cards.filter(
        (card) => !pending.some((p) => p.runKey === question.runKey && p.cardId === card.id),
      );
      pending.push(...fresh.map((card) => ({ ...question, cardId: card.id, area: card.area })));
    } else skipped.push({ cardId: question.cardId, runKey: question.runKey, reason: found.reason });
  }
  return { project, pending, skipped, baseline: [...byRun.values()].flat() };
}

/** The affected areas, restricted to the named ones when the request named some. */
export function areasToRun(plan: RerunPlan, named: readonly string[] | undefined): string[] {
  const areas = [...new Set(plan.pending.map((question) => question.area))];
  return named === undefined || named.length === 0
    ? areas
    : areas.filter((area) => named.includes(area));
}

/** The plan with only the questions of these areas. */
export function onlyAreas(plan: RerunPlan, areas: readonly string[]): RerunPlan {
  return { ...plan, pending: plan.pending.filter((question) => areas.includes(question.area)) };
}

/** What the reader of the area is told: each question, where it came from and the answer. */
function answersTextOf(plan: RerunPlan, area: string): string | undefined {
  const questions = plan.pending.filter((question) => question.area === area);
  if (questions.length === 0) return undefined;
  return questions
    .map(
      (each) =>
        `Question ${each.cardId}: ${each.question}\nRaised from: ${each.context}\nOwner's answer: ${each.answer}`,
    )
    .join('\n\n');
}

/** The tasks with the answers of their area. */
export function withAnswersOf(
  tasks: readonly ReaderTask[],
  plan: RerunPlan,
): readonly ReaderTask[] {
  return tasks.map((task) => {
    const answers = answersTextOf(plan, task.area.name);
    return answers === undefined ? task : { ...task, answers };
  });
}

/** Marks the questions of the areas whose task ended `Done` as `Answered`; their card ids. */
// RF-241
export async function markAnswered(
  deps: RerunDependencies,
  plan: RerunPlan,
  doneAreas: ReadonlySet<string>,
): Promise<readonly string[]> {
  const done = plan.pending.filter((question) => doneAreas.has(question.area));
  const runs = [...new Set(done.map((question) => question.runKey))];
  const marked: string[] = [];
  for (const runKey of runs) {
    const ids = done.filter((question) => question.runKey === runKey).map((each) => each.cardId);
    marked.push(...(await deps.cards.markAnswered(plan.project, runKey, ids)));
  }
  return marked;
}

/** RF-241: the new and changed cards of a re-run with answers; nothing for any other run. */
export function changesOf(
  rerun: Rerun | undefined,
  cards: readonly Card[],
): { readonly changes?: CardChanges } {
  return rerun === undefined ? {} : { changes: compareCards(cards, rerun.plan.baseline) };
}
