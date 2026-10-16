import type { PlanningBrief, UnsavedBrief } from '../../domain/planning/planning-brief.js';

// RF-605: what Plan setup shows for a project: the saved brief, or the defaults while nothing is
// saved, and whether a package already written no longer matches the saved brief.

export interface PlanningBriefState {
  readonly brief: PlanningBrief | UnsavedBrief;
  /** False while the brief is only the defaults. */
  readonly saved: boolean;
  /** True when the brief was saved after the newest package's run started. */
  readonly outOfDate: boolean;
}
