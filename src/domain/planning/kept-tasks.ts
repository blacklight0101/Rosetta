import { listedFiles } from './parallel-cards.js';
import { draftFault, noRequirement, type LeftOutCard } from './left-out-card.js';
import type { DraftTask, PlanDraft } from './plan-draft.js';
import type { RiskClass } from './task-card-quality.js';
import { taskRequirements } from './task-requirements.js';

// RF-601, RF-607, RF-630, P7-15: which draft tasks of the planner's answer are cards of the plan.
// P8-02: under SDD a card that implements no requirement of the plan is not left out here; it is
// kept with `derives` set, and takes its requirements from what it builds once the cards are linked
// (P7-14, derived-requirements.ts). Only a card with nothing to derive is left out then.
export interface KeptTask {
  readonly position: number;
  readonly task: DraftTask;
  readonly riskClass: RiskClass;
  readonly requirements: string[];
  readonly files: string[];
  /** P8-02: its position, when its requirements are to be taken from what it builds. */
  readonly derives?: number;
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
    const derives = fault === undefined && found.fault === noRequirement;
    const left = fault ?? (derives ? undefined : found.fault);
    if (left !== undefined || riskClass === undefined) {
      if (left !== undefined) leftOut.push({ position, ...left });
      return;
    }
    const files = listedFiles(task.files);
    kept.push({
      position,
      task,
      riskClass,
      requirements,
      files,
      ...(derives ? { derives: position } : {}),
    });
  });
  return { kept, leftOut };
}
