import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import {
  projectQuestions,
  type ProjectQuestion,
  type ProjectQuestionDependencies,
} from '../answers/project-questions.js';
import { noManifests } from '../answers/run-family.js';
import type { AnswerEntry, AnswersFile } from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';

// RF-1007, RF-240, RF-1105, RF-646, DEC-15: Record answers writes the user's answers to open questions
// into the project's `answers.md`; the other answers in the file are kept. A question of the one list
// (the run and the Deepens linked to it) is written where its answer is: in the section of the run
// that holds it, else the oldest section; a survivor the file has no section for gets one first, with
// its suggested answers. An empty answer clears the question in every section that holds it. A card
// id the list has no question for changes nothing. Another user's run id and an unknown id give the
// same answer. Marking the questions answered is the re-run's work (RF-241).

export interface RecordAnswersDependencies {
  readonly runs: RunIndex;
  readonly answers: AnswersFile;
  readonly cards: PriorCards;
  /** Finds the Deepens linked to the run; without it the run is a family of one. */
  readonly manifests?: Pick<RunManifestStore, 'read'>;
}

export type RecordAnswersProblem = 'not-found' | 'unknown-question' | 'invalid-choice';

type Writes = Map<string, AnswerEntry[]>;

/** The question an entry names: by the id of the list or by the id of any version of it. */
function questionOf(list: readonly ProjectQuestion[], cardId: string): ProjectQuestion | undefined {
  return (
    list.find((each) => each.cardId === cardId) ??
    list.find((each) => each.members.some((member) => member.cardId === cardId))
  );
}

/** Where each entry is written: the home section, or every section that holds the question when it is cleared. */
function writesOf(
  list: readonly ProjectQuestion[],
  entries: readonly AnswerEntry[],
): { readonly writes: Writes; readonly missing: ProjectQuestion[] } | undefined {
  const writes: Writes = new Map();
  const missing: ProjectQuestion[] = [];
  for (const entry of entries) {
    const question = questionOf(list, entry.cardId);
    if (question === undefined) return undefined;
    const clears = entry.answer.trim() === '';
    const holders = question.members.filter((each) => each.filed);
    if (!question.home.filed) missing.push(question);
    const targets = clears && holders.length > 0 ? holders : [question.home];
    for (const target of targets) {
      const isHome = target.runKey === question.home.runKey;
      const mine = isHome ? entry : { cardId: entry.cardId, answer: '' };
      const put = writes.get(target.runKey) ?? [];
      put.push({ ...mine, cardId: target.cardId });
      writes.set(target.runKey, put);
    }
  }
  return { writes, missing };
}

export class RecordAnswers {
  private readonly deps: RecordAnswersDependencies;

  constructor(deps: RecordAnswersDependencies) {
    this.deps = deps;
  }

  // RF-1007, RF-1105, RF-646
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
    readonly answers: readonly AnswerEntry[];
  }): Promise<Result<readonly ProjectQuestion[], RecordAnswersProblem>> {
    const { runs, answers, cards } = this.deps;
    const run = await runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const project = { userId: run.userId, projectId: run.projectId };
    const read: ProjectQuestionDependencies = {
      ...{ runs, answers, priorCards: cards },
      manifests: this.deps.manifests ?? noManifests,
    };
    const planned = writesOf((await projectQuestions(read, run)).questions, request.answers);
    if (planned === undefined) return err('unknown-question');
    // P5-11: a survivor the file has no section for gets one first, with the options it offers.
    const sections = planned.missing.map((question) => ({
      ...{ cardId: question.home.cardId, runKey: question.home.runKey, survivor: true },
      ...{ question: question.question, context: question.context },
      ...(question.options === undefined ? {} : { options: question.options }),
    }));
    if (sections.length > 0) await answers.addQuestions(project, sections);
    for (const [runKey, entries] of planned.writes) {
      const recorded = await answers.recordAnswers(project, runKey, entries);
      if (!recorded.ok) return recorded;
    }
    return ok((await projectQuestions(read, run)).questions);
  }
}
