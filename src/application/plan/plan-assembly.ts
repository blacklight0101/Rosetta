import { assemblePlan, type PlanAssembly } from '../../domain/planning/plan-content.js';
import type { PlanDraft } from '../../domain/planning/plan-draft.js';
import type { Run } from '../../domain/runs/run.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { Logger } from '../ports/logger.js';
import type { PlannerCall } from './ask-planner.js';
import { entryNoteMessage } from './list-entries.js';
import type { PlanMessageInput } from './plan-message.js';
import type { PlanProblem } from './plan-reading.js';
import { repairPlan, unreadableMessages } from './plan-repair.js';

// RF-604: the planner's answer checked against the supported cards; what the check leaves out is
// logged as a warning of the run.
// P8-02, RF-604, RF-607, EV-83: when the check leaves out every requirement, or (given SDD) leaves
// no task card with a requirement because every requirement they name was left out, the planner gets
// one repair round before the run fails with RST-1803: the same message, the repair prompt and a
// line for each item left out with the reason, written by this program. The round goes through the
// same guarded provider, so its cost counts in the run. The better of the two answers is used. A
// card left without a requirement while others keep theirs gets no round: it derives its
// requirements from what it builds once the cards are linked (derived-requirements.ts).

interface Checks {
  readonly supported: readonly string[];
  readonly specificationDriven: boolean;
}

/** The parts of the one repair round of the sources. */
export interface SourceRepair {
  readonly call: PlannerCall;
  readonly input: PlanMessageInput;
  readonly prompt: PromptFile;
}

const UNSOURCED =
  'No entry of its "sources" is the id of a card of the cards block, so the requirement was left out. Write card ids such as ENT-002, not claim ids such as ENT-002.c4.';
const ORPHANED =
  'Every requirement it names was left out, so the card implements none and the plan is specification-driven.';

/** P8-02: the items the check left out that call for the repair round; none when it is not due. */
function sourceProblems(assembly: PlanAssembly): PlanProblem[] {
  const { requirements, tasks } = assembly.content;
  const noCardKeepsOne = tasks.length > 0 && tasks.every((task) => task.requirements.length === 0);
  const due = requirements.length === 0 || (assembly.orphaned.length > 0 && noCardKeepsOne);
  if (!due) return [];
  return [
    ...assembly.unsourced.map((position) => ({
      ...{ list: 'requirements', position, field: 'sources', reason: UNSOURCED },
    })),
    ...assembly.orphaned.map((position) => ({
      ...{ list: 'tasks', position, field: 'requirements', reason: ORPHANED },
    })),
  ];
}

/** How good an assembly is: it has requirements, then fewer cards left without one, then more requirements. */
function better(second: PlanAssembly, first: PlanAssembly): boolean {
  const kept = (each: PlanAssembly): number => each.content.requirements.length;
  if (kept(first) === 0 || kept(second) === 0) return kept(second) > 0;
  if (second.orphaned.length !== first.orphaned.length) {
    return second.orphaned.length < first.orphaned.length;
  }
  return kept(second) >= kept(first);
}

async function logged(
  logger: Logger,
  run: Run,
  assembly: PlanAssembly,
): Promise<PlanAssembly | undefined> {
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

/**
 * The checked answer, after the one repair round of its sources when the check left out every
 * requirement or (given SDD) left cards with none; undefined when no requirement is left after it.
 */
// P8-02, RF-604
export async function repairedAssembly(
  logger: Logger,
  run: Run,
  draft: PlanDraft,
  checks: Checks & { readonly repair: SourceRepair },
): Promise<PlanAssembly | undefined> {
  const { specificationDriven, repair } = checks;
  const assemble = (each: PlanDraft): PlanAssembly =>
    assemblePlan(each, new Set(checks.supported), { specificationDriven });
  const first = assemble(draft);
  const problems = sourceProblems(first);
  if (problems.length === 0) return logged(logger, run, first);
  await logger.log({
    ...{ level: 'warn', logger: 'plan', runId: run.runKey, userId: run.userId },
    message: `The planner answer left out ${String(first.unsourced.length)} requirement(s) that name no supported card and ${String(first.orphaned.length)} task card(s) with no requirement left; the planner is asked once more, with what was left out and why.`,
  });
  const reading = await repairPlan(repair.call, repair.input, { prompt: repair.prompt, problems });
  const second = reading.draft === undefined ? undefined : assemble(reading.draft);
  return logged(logger, run, second !== undefined && better(second, first) ? second : first);
}
