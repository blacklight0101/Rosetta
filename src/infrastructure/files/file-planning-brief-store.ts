/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-meaningless-void-operator -- placeholder of the TDD red step, replaced by the next commit */
import type { ProjectRef } from '../../application/ports/answers-file.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { PlanningBriefStore } from '../../application/ports/planning-brief-store.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { TextMasker } from '../guards/secret-masker.js';

export interface FilePlanningBriefStoreOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

// Placeholder behaviour: the tests of the next commit fail on it, the implementation follows.
export class FilePlanningBriefStore implements PlanningBriefStore {
  private readonly options: FilePlanningBriefStoreOptions;

  constructor(options: FilePlanningBriefStoreOptions) {
    this.options = options;
  }

  read(_project: ProjectRef): Promise<PlanningBrief | undefined> {
    void this.options;
    return Promise.resolve(undefined);
  }

  write(_project: ProjectRef, _brief: PlanningBrief): Promise<void> {
    return Promise.resolve();
  }
}
