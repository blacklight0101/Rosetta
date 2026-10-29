import type { Run } from '../../domain/runs/run.js';
import type {
  AnswerRecord,
  AnswersFile,
  MergeEdit,
  ProjectRef,
  RecordedQuestion,
} from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import { questionWords } from '../understand/open-questions.js';
import { consolidatedStates, type StatedQuestion } from '../use-cases/question-states.js';
import { familyOf, type FamilyDependencies, type RunFamily } from './run-family.js';

// RF-646, RF-1007, DEC-179: the one list of questions of a project. The questions of an understand run
// and of the Deepens linked to it are merged by the merge record of the cards (RF-1007: a Deepen copies
// the cards of its parent and keeps their ids, and consolidation records what it merged) and by
// asking-the-same (Q-52). Every answer is kept: the newest run's answer wins and the older ones are the
// history of the question. Nothing is removed from `answers.md`; a section of a run stays where it is.

export interface ProjectQuestionDependencies extends FamilyDependencies {
  readonly answers: Pick<AnswersFile, 'questionsOf'>;
  readonly priorCards: Pick<PriorCards, 'cardsOf'>;
}

/** One run's version of a question. */
export interface QuestionMember {
  readonly runKey: string;
  readonly cardId: string;
  /** `answers.md` has a section for it under this run. */
  readonly filed: boolean;
}

/** A question of the one list. */
export interface ProjectQuestion extends StatedQuestion {
  /** The version a save writes to: the one that holds the answer, else the oldest with a section. */
  readonly home: QuestionMember;
  /** Every version, oldest run first. */
  readonly members: readonly QuestionMember[];
}

export interface ProjectQuestions {
  readonly questions: readonly ProjectQuestion[];
  readonly family: RunFamily;
}

interface Entry extends QuestionMember {
  readonly stated: StatedQuestion;
}

const isBlank = (answer: string): boolean => answer.trim() === '';

/** P5-22: a reader that needs no dependents reads only the `OQ` cards, which a kept parse holds. */
function cardsFor(deps: ProjectQuestionDependencies, lean: boolean): Pick<PriorCards, 'cardsOf'> {
  if (!lean) return deps.priorCards;
  return { cardsOf: (project, runKey) => deps.priorCards.cardsOf(project, runKey, ['OQ']) };
}

async function entriesOf(
  deps: ProjectQuestionDependencies,
  project: ProjectRef,
  run: Run,
  lean: boolean,
): Promise<readonly Entry[]> {
  const filed = await deps.answers.questionsOf(project, run.runKey);
  const stated = await consolidatedStates(cardsFor(deps, lean), project, run.runKey, filed);
  const ids = new Set(filed.map((each) => each.cardId));
  return stated.map((each) => ({
    ...{ runKey: run.runKey, cardId: each.cardId, filed: ids.has(each.cardId) },
    stated: each,
  }));
}

/** The group a version joins: the one with its card id (a Deepen copies the cards) or its words. */
function groupFor(groups: readonly Entry[][], entry: Entry): Entry[] | undefined {
  const words = questionWords(entry.stated.question);
  return groups.find(
    (group) =>
      group.every((member) => member.runKey !== entry.runKey) &&
      group.some(
        (member) =>
          member.cardId === entry.cardId ||
          (words !== '' && questionWords(member.stated.question) === words),
      ),
  );
}

function groupsOf(perRun: readonly (readonly Entry[])[]): readonly (readonly Entry[])[] {
  const groups: Entry[][] = [];
  for (const entries of perRun) {
    for (const entry of entries) {
      const found = groupFor(groups, entry);
      if (found === undefined) groups.push([entry]);
      else found.push(entry);
    }
  }
  return groups;
}

/** The older answers: the ones kept in the file and those of the other versions that lost. */
function historyOf(group: readonly Entry[], winner: Entry | undefined): readonly AnswerRecord[] {
  const kept = group.flatMap((each) => each.stated.history ?? []);
  const lost = group
    .filter((each) => each !== winner && !isBlank(each.stated.answer))
    .map((each) => ({ runKey: each.runKey, answer: each.stated.answer }));
  const seen = new Set<string>();
  return [...kept, ...lost].filter((record) => {
    const key = `${record.runKey}\n${record.answer}`;
    const fresh = record.answer !== (winner?.stated.answer ?? '') && !seen.has(key);
    seen.add(key);
    return fresh;
  });
}

/** The suggested answers of the version a save writes to, and the choice made among them. */
function optionsOf(stated: StatedQuestion): Pick<RecordedQuestion, 'options' | 'chosen'> {
  return stated.options === undefined
    ? {}
    : { options: stated.options, chosen: stated.chosen ?? '' };
}

/** Answered when any version is: a Deepen that used the answer marks its own copy of the card. */
const stateOf = (group: readonly Entry[]): StatedQuestion['state'] =>
  group.some((each) => each.stated.state === 'Answered') ? 'Answered' : 'Open';

const dependentsOf = (group: readonly Entry[]): number =>
  Math.max(...group.map((each) => each.stated.dependents));

function questionOf(group: readonly Entry[]): ProjectQuestion {
  const [oldest] = group;
  const winner = group.findLast((each) => !isBlank(each.stated.answer));
  const home = winner ?? group.find((each) => each.filed) ?? oldest;
  if (oldest === undefined || home === undefined) throw new Error('A question has no version.');
  const base = oldest.stated;
  const history = historyOf(group, winner);
  const runs = group.map((each) => each.runKey);
  return {
    ...{ cardId: base.cardId, question: base.question, context: base.context },
    ...{ answer: winner?.stated.answer ?? '' },
    ...optionsOf(home.stated),
    ...(runs.length > 1 ? { runs } : {}),
    ...(history.length > 0 ? { history } : {}),
    ...{ state: stateOf(group), dependents: dependentsOf(group) },
    home: { runKey: home.runKey, cardId: home.cardId, filed: home.filed },
    members: group.map(({ runKey, cardId, filed }) => ({ runKey, cardId, filed })),
  };
}

// RF-646, RF-1007
export async function projectQuestions(
  deps: ProjectQuestionDependencies,
  run: Run,
  /** Reads only the open question cards: `dependents` is then 0 (the plan inputs need none). */
  options: { readonly lean?: boolean } = {},
): Promise<ProjectQuestions> {
  const project = { userId: run.userId, projectId: run.projectId };
  const family = await familyOf(deps, run);
  const perRun = await Promise.all(
    family.runs.map((each) => entriesOf(deps, project, each, options.lean === true)),
  );
  return { questions: groupsOf(perRun).map(questionOf), family };
}

/** The question as the readers of the one list (plan inputs, report) take it. */
export function recordedOf(question: ProjectQuestion): RecordedQuestion {
  const { cardId, question: asked, context, answer, options, chosen } = question;
  return {
    ...{ cardId, question: asked, context, answer },
    ...(options === undefined ? {} : { options, chosen: chosen ?? '' }),
  };
}

/** The lines a merge keeps in the section that survives: the runs and the older answers. */
export function mergeEditsOf(questions: readonly ProjectQuestion[]): readonly MergeEdit[] {
  return questions.flatMap((question) => {
    const runs = question.runs ?? [];
    const history = question.history ?? [];
    const target = question.home.filed ? question.home : question.members.find((m) => m.filed);
    if ((runs.length < 2 && history.length === 0) || target === undefined) return [];
    return [{ runKey: target.runKey, cardId: target.cardId, runs, history }];
  });
}
