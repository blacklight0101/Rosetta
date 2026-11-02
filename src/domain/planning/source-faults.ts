import type { PlanDraft } from './plan-draft.js';

// P8-02, RF-604, RF-607: what the check of the sources left out, for the one repair round of the
// plan answer (plan-assembly.ts): the draft requirements that name no supported card and, under SDD,
// the draft tasks whose requirement positions all name such a requirement.

export interface SourceFaults {
  /** The positions (from 1) of the draft requirements left out for naming no supported card. */
  readonly unsourced: readonly number[];
  /** Under SDD, the positions (from 1) of the draft tasks left with no requirement of the plan. */
  readonly orphaned: readonly number[];
}

/** P8-02: the requirements left out for their sources, and under SDD the tasks left with none. */
export function sourceFaults(
  draft: PlanDraft,
  idAt: ReadonlyMap<number, string>,
  specified: boolean,
): SourceFaults {
  return {
    unsourced: draft.requirements.flatMap((_, at) => (idAt.has(at + 1) ? [] : [at + 1])),
    orphaned: specified ? orphanedTasks(draft, idAt) : [],
  };
}

/** P8-02: the draft tasks whose requirement positions all name a requirement that was left out. */
function orphanedTasks(draft: PlanDraft, idAt: ReadonlyMap<number, string>): number[] {
  const count = draft.requirements.length;
  return draft.tasks.flatMap((task, at) => {
    const named = task.requirements.filter((position) => position >= 1 && position <= count);
    const orphaned = named.length > 0 && named.every((position) => !idAt.has(position));
    return orphaned ? [at + 1] : [];
  });
}
