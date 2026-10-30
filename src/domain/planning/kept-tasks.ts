import { listedFiles } from './parallel-cards.js';
import { draftFault, type LeftOutCard } from './left-out-card.js';
import type { DraftTask, PlanDraft } from './plan-draft.js';
import type { RiskClass } from './task-card-quality.js';
import { taskRequirements } from './task-requirements.js';

// RF-601, RF-607, RF-630, P7-15: which draft tasks of the planner's answer are cards of the plan.
export interface KeptTask {
  readonly position: number;
  readonly task: DraftTask;
  readonly riskClass: RiskClass;
  readonly requirements: string[];
  readonly files: string[];
}

/** The draft tasks that are cards of the plan, and by position and field the ones that are not. */
export function keptTasks(
  draft: Pick<PlanDraft, 'tasks' | 'phases' | 'entryNotes'>,
  idAt: ReadonlyMap<number, string>,
  specified: boolean,
): { readonly kept: KeptTask[]; readonly leftOut: LeftOutCard[] } {
  const kept: KeptTask[] = [];
  const leftOut: LeftOutCard[] = [];
  draft.tasks.forEach((task, index) => {
    const position = index + 1;
    const { riskClass } = task;
    const fault = draftFault(task, draft.phases.length);
    const ids = task.requirements.flatMap((at) => idAt.get(at) ?? []);
    const found = taskRequirements(ids, {
      specified,
      entries: draft.entryNotes ?? [],
      card: position,
    });
    const { requirements } = found;
    const left = fault ?? found.fault;
    if (left !== undefined || riskClass === undefined) {
      if (left !== undefined) leftOut.push({ position, ...left });
      return;
    }
    kept.push({ position, task, riskClass, requirements, files: listedFiles(task.files) });
  });
  return { kept, leftOut };
}
