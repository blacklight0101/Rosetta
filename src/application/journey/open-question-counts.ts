import type { ProjectQuestionDependencies } from '../answers/project-questions.js';
import type { ProjectRef } from '../ports/answers-file.js';
import type { JourneyFactsStore } from '../ports/journey-facts-store.js';
import { openQuestionCounts } from './journey-file-facts.js';

// P8-139, DEC-226, RF-615, RF-646: the open questions of a project's understand runs are stored on
// their rows, one number per family. Every path that changes them refreshes the project: the end
// of an understand run (its questions and cards), an answer saved, a question reopened and a run
// deleted (a family loses a run). The number is the one the journey read counted from the files.

export interface OpenQuestionCountDependencies extends ProjectQuestionDependencies {
  readonly facts: Pick<JourneyFactsStore, 'recordOpenQuestions'>;
}

export class OpenQuestionCounts {
  private readonly deps: OpenQuestionCountDependencies;

  constructor(deps: OpenQuestionCountDependencies) {
    this.deps = deps;
  }

  // RF-615, RF-646
  async refresh(project: ProjectRef): Promise<void> {
    const runs = await this.deps.runs.list(project.userId, project.projectId);
    const counts = await openQuestionCounts(this.deps, runs);
    const byCount = new Map<number, string[]>();
    for (const [runId, count] of counts) byCount.set(count, [...(byCount.get(count) ?? []), runId]);
    for (const [count, runIds] of byCount) {
      await this.deps.facts.recordOpenQuestions(project.userId, runIds, count);
    }
  }
}
