import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AnswersFile, RecordedQuestion } from '../ports/answers-file.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-1007, RF-240, RF-1105: List answers gives the live run page the open questions the run added
// to its project's `answers.md`, with the answers recorded so far. Another user's run id and an
// unknown id give the same answer.

export interface ListAnswersDependencies {
  readonly runs: RunIndex;
  readonly answers: AnswersFile;
}

export class ListAnswers {
  private readonly deps: ListAnswersDependencies;

  constructor(deps: ListAnswersDependencies) {
    this.deps = deps;
  }

  // RF-1007, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<readonly RecordedQuestion[], 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const project = { userId: run.userId, projectId: run.projectId };
    return ok(await this.deps.answers.questionsOf(project, run.runKey));
  }
}
