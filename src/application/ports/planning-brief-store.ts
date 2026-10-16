import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { ProjectRef } from './answers-file.js';

// RF-605, data-model.md section 3.20: the project's `planning-brief.json`, one file per project in
// the owner's workspace, replaced whole on every save.

export interface PlanningBriefStore {
  /** Undefined while the project has no saved brief; rejects when the file cannot be read. */
  read(project: ProjectRef): Promise<PlanningBrief | undefined>;
  /** Replaces the file atomically; rejects with the writer's code when it cannot be stored. */
  write(project: ProjectRef, brief: PlanningBrief): Promise<void>;
}
