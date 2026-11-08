import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { ProjectQuestionDependencies } from '../answers/project-questions.js';
import type { ProjectRef } from '../ports/answers-file.js';
import type { JourneyFactsStore } from '../ports/journey-facts-store.js';
import type { Logger } from '../ports/logger.js';
import { openQuestionCounts } from './journey-file-facts.js';

// P8-139, DEC-226, RF-615, RF-646: the open questions of a project's understand runs are stored on
// their rows, one number per family. Every path that changes them refreshes the project: the end
// of an understand run (its questions and cards), an answer saved, a question reopened and a run
// deleted (a family loses a run). The number is the one the journey read counted from the files.
// The refreshes of one project run one after the other, so a count read earlier never lands after
// a newer one. A refresh that fails is logged (`warn`) and never fails the change it follows: the
// next refresh of the project stores the count again.

export interface OpenQuestionCountDependencies extends ProjectQuestionDependencies {
  readonly facts: Pick<JourneyFactsStore, 'recordOpenQuestions'>;
  readonly logger: Logger;
}

export class OpenQuestionCounts {
  private readonly deps: OpenQuestionCountDependencies;
  /** The last refresh asked of each project, by project id. */
  private readonly last = new Map<string, Promise<void>>();

  constructor(deps: OpenQuestionCountDependencies) {
    this.deps = deps;
  }

  // RF-615, RF-646
  refresh(project: ProjectRef): Promise<void> {
    const before = this.last.get(project.projectId) ?? Promise.resolve();
    const store = (): Promise<void> => this.store(project);
    const next = before.then(store, store);
    this.last.set(project.projectId, next);
    const forget = (): void => {
      if (this.last.get(project.projectId) === next) this.last.delete(project.projectId);
    };
    void next.then(forget, forget);
    return next;
  }

  private async store(project: ProjectRef): Promise<void> {
    try {
      const runs = await this.deps.runs.list(project.userId, project.projectId);
      const counts = await openQuestionCounts(this.deps, runs);
      const byCount = new Map<number, string[]>();
      for (const [runId, count] of counts)
        byCount.set(count, [...(byCount.get(count) ?? []), runId]);
      for (const [count, runIds] of byCount) {
        await this.deps.facts.recordOpenQuestions(project.userId, runIds, count);
      }
    } catch (error) {
      await this.deps.logger.log({
        level: 'warn',
        logger: 'journey',
        message:
          'The open questions of the project could not be stored; the next change stores them.',
        userId: project.userId,
        ...(error instanceof RosettaError ? { code: error.code } : {}),
        data: { projectId: project.projectId },
      });
    }
  }
}
