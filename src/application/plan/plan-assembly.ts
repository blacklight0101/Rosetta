import { assemblePlan, type PlanAssembly } from '../../domain/planning/plan-content.js';
import type { PlanDraft } from '../../domain/planning/plan-draft.js';
import type { Run } from '../../domain/runs/run.js';
import type { Logger } from '../ports/logger.js';
import { entryNoteMessage } from './list-entries.js';
import { unreadableMessages } from './plan-repair.js';

// RF-604: the planner's answer checked against the supported cards; what the check leaves out is
// logged as a warning of the run.

/** The planner's answer checked against the supported cards; undefined when nothing is left. */
// RF-604
export async function checkedAssembly(
  logger: Logger,
  run: Run,
  draft: PlanDraft,
  checks: { readonly supported: readonly string[]; readonly specificationDriven: boolean },
): Promise<PlanAssembly | undefined> {
  const { specificationDriven } = checks;
  const assembly = assemblePlan(draft, new Set(checks.supported), { specificationDriven });
  const warn = (message: string): Promise<void> =>
    logger.log({
      ...{ level: 'warn', logger: 'plan', runId: run.runKey, userId: run.userId },
      message,
    });
  for (const message of unreadableMessages(assembly.unreadable)) await warn(message);
  for (const note of assembly.content.requirementNotes ?? []) {
    if (note.kind === 'entries') await warn(entryNoteMessage(note));
  }
  for (const left of assembly.leftOut) {
    const { position, field, reason } = left;
    await warn(
      `Task card at position ${String(position)} of the plan answer was left out (the field "${field}"). ${reason}`,
    );
  }
  const { requirements, entities, tasks, technical } = assembly.dropped;
  if (requirements + entities + tasks + technical > 0) {
    await warn(
      `The planner answer had items without a supported card, a phase or (given SDD) a requirement; ${String(requirements)} requirement(s), ${String(entities)} entity mapping(s), ${String(tasks)} task card(s) and ${String(technical)} technical item(s) were left out.`,
    );
  }
  return assembly.content.requirements.length === 0 ? undefined : assembly;
}
