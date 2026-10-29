import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import {
  mergeEditsOf,
  projectQuestions,
  type ProjectQuestion,
} from '../answers/project-questions.js';
import { noManifests } from '../answers/run-family.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';

// RF-1007, RF-240, RF-1105, RF-646: List answers gives the live run page the one list of the project:
// the open questions the run and the Deepens linked to it added to `answers.md`, merged, with the
// answers recorded so far and the state of each (RF-241). Duplicates saved before DEC-179 are merged
// here, on read, keeping every answer: the runs that raised a question and the older answers are
// kept in its section. Another user's run id and an unknown id give the same answer.

export interface ListAnswersDependencies {
  readonly runs: RunIndex;
  readonly answers: AnswersFile;
  readonly cards: PriorCards;
  /** Finds the Deepens linked to the run; without it the run is a family of one. */
  readonly manifests?: Pick<RunManifestStore, 'read'>;
}

/** The questions of the one list and what the page needs to know about the run's family. */
export interface ListedAnswers {
  readonly questions: readonly ProjectQuestion[];
  /** How many Deepens linked to the run's first understand run have ended. */
  readonly deepens: number;
  /** The run is itself a Deepen. */
  readonly isDeepen: boolean;
}

export class ListAnswers {
  private readonly deps: ListAnswersDependencies;

  constructor(deps: ListAnswersDependencies) {
    this.deps = deps;
  }

  // RF-1007, RF-1105, RF-646
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<ListedAnswers, 'not-found'>> {
    const { runs, answers, cards, manifests } = this.deps;
    const run = await runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const found = await projectQuestions(
      { runs, answers, priorCards: cards, manifests: manifests ?? noManifests },
      run,
    );
    const project = { userId: run.userId, projectId: run.projectId };
    await answers.keepMerge(project, mergeEditsOf(found.questions));
    const { deepens, isDeepen } = found.family;
    return ok({ questions: found.questions, deepens, isDeepen });
  }
}
