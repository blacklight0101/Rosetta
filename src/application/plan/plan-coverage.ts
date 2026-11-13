import type { PlanContent } from '../../domain/planning/plan-content.js';
import {
  coverageItems,
  coverageOf,
  linkTasks,
  requirementItems,
  withBuiltRequirements,
  withMigrationCard,
  type CoverageDocuments,
  type CoverageReport,
} from '../../domain/planning/plan-coverage.js';
import { moduleItems } from '../../domain/planning/module-coverage.js';
import { alignRequirements } from '../../domain/planning/requirement-alignment.js';
import { withRequirementFeatures } from '../../domain/planning/requirement-features.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { parseCoverageAnswer } from './coverage-answer.js';
import { coverageMessage } from './coverage-message.js';

// RF-627, RF-623, ADR-018: the coverage of the package by the task cards. Once the documents are
// written, the planner is asked, through the same guarded provider, which items each task card
// builds; its answer is checked against the ids of the items (the domain), so a link to an id that
// is no item builds nothing. The first card of the plan then writes the migrations, and each card that
// builds an item gets the requirements of the cards behind that item (requirement-alignment.ts).
// Without an item or without a task there is nothing to link and no call is made: a plan with no
// task leaves every item uncovered. An answer that is unusable is not a failure of the call (like an unreadable
// PRD): no task links an item, and the caller logs it.

export interface CoverageInput {
  readonly content: PlanContent;
  readonly documents: CoverageDocuments;
}

export interface PlannedCoverage {
  /** The plan with the ids each task builds and the card that writes the migrations. */
  readonly content: PlanContent;
  readonly report: CoverageReport;
  /** False when no call was made. */
  readonly asked: boolean;
  /** False when the planner was asked and its answer could not be read. */
  readonly readable: boolean;
}

/**
 * P5-40: the plan checked against the documents: each card that builds an item lists the
 * requirements behind it, and each card that lists a requirement builds the features it leads to.
 * It runs after the coverage call and again after every gap round, so a card the gap pass added is
 * checked like the others and a feature it builds through its requirements is not asked for again.
 */
// RF-627
export function checkedPlan(content: PlanContent, documents: CoverageDocuments): PlanContent {
  const aligned = withRequirementFeatures(alignRequirements(content, documents), documents);
  // P9-06: a gap card or link that builds `requirement:REQ-n` lists the requirement.
  return withBuiltRequirements(aligned);
}

// RF-627, RF-623
export async function planCoverage(
  call: PlannerCall,
  input: CoverageInput,
): Promise<PlannedCoverage> {
  // P8-06: the modules of the source and its deployment material are items as well.
  const items = [...coverageItems(input.documents), ...moduleItems(input.documents.modules)];
  // P9-06, EV-108: the requirements of the plan are items of the report (not of the first call).
  const all = [...items, ...requirementItems(input.content.requirements)];
  const { tasks } = input.content;
  if (items.length === 0 || tasks.length === 0) {
    return {
      content: input.content,
      report: coverageOf(all, tasks),
      asked: false,
      readable: true,
    };
  }
  const answer = await askPlannerWith(call, coverageMessage({ tasks, items }, call.tags));
  const draft = parseCoverageAnswer(answer);
  const linked = { ...input.content, tasks: linkTasks(tasks, draft, items) };
  const migrated = withMigrationCard(linked, input.documents.dataModel.tables);
  const content = checkedPlan(migrated, input.documents);
  const report = coverageOf(all, content.tasks);
  return { content, report, asked: true, readable: draft !== undefined };
}

/** RF-627: what to log about the coverage: an unreadable answer, and the items no card builds. */
export function coverageWarnings(planned: PlannedCoverage): string[] {
  const unreadable =
    planned.asked && !planned.readable
      ? [
          'The planner answer for the task card links could not be read; no task card links an item.',
        ]
      : [];
  const modules = planned.report.modules.length;
  const untouched =
    modules === 0
      ? []
      : [
          `${String(modules)} module(s) of the source or its deployment material are touched by no task card; checks.md names each with the reason.`,
        ];
  const count = planned.report.uncovered.length;
  const gap =
    count === 0
      ? []
      : [
          `${String(count)} item(s) of the package are built by no task card; they are listed in checks.md and the run is not complete.`,
        ];
  return [...unreadable, ...gap, ...untouched];
}
