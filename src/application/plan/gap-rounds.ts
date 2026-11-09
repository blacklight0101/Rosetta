import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { CoverageDocuments, CoverageItem } from '../../domain/planning/plan-coverage.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { PlannerCall } from './ask-planner.js';
import type { GapProblem } from './gap-answer.js';
import { gapItems, gapRound, roundLeftOut, roundWarnings } from './gap-round.js';
import type { HandoffPackage } from './handoff-package.js';
import type { PlannedCoverage } from './plan-coverage.js';

// Q-45, Q-54, RF-627, P8-06, P8-96, ADR-007: the gap rounds of a plan. The first round is the gap
// call for the items no card builds and, when its answer left out cards that named an item still
// open, one repair attempt. P8-96 (EV-95): when items are still built by no card after it and every
// answer of it could be read, the planner gets one second round, the same gap call for only the
// items still open; it has no repair of its own, and only what it leaves open is reported, so the
// run ends RST-1806 only after it. Every call goes through the same guarded provider as any planner
// call (metered, capped, the approved amount and the Ollama context guard); a refusal keeps the
// plan as the calls before it left it and is handed back for the caller to end the run with its
// code. The rounds that ran are counted for the run's record: a refused round did not run.

export interface LinkCalls {
  readonly coverage: PlannerCall;
  readonly gap: PlannerCall;
  /** Q-54: the versioned prompt that asks for the cards again, with the problems listed. */
  readonly repairPrompt: PromptFile;
  /** RF-607: given SDD, a task card that implements no requirement is not written. */
  readonly specificationDriven: boolean;
}

/** The plan after the gap rounds, with every card those rounds left out (P8-06 reasons). */
interface Gapped {
  readonly planned: PlannedCoverage;
  readonly warnings: readonly string[];
  readonly leftOut: HandoffPackage['leftOut'];
  /** Why a call was not served; the plan is then the one the calls before it left. */
  readonly refusal?: RosettaError;
  readonly problems: readonly GapProblem[];
  /** P8-96: how many gap rounds ran (0, 1 or 2); the repair is part of the first. */
  readonly rounds: number;
}

/** The first round, and whether every answer of it (the call and its repair) could be read. */
interface FirstRound {
  readonly gapped: Gapped;
  readonly readable: boolean;
}

const UNREADABLE_GAP =
  'The planner answer with the task cards for the items no card builds could not be read; none was added.';
const UNREADABLE_REPAIR =
  'The planner answer with the repaired task cards for the items no card builds could not be read; none was added.';
const UNREADABLE_SECOND =
  'The planner answer of the second gap round could not be read; no task card was added.';

/**
 * The cards left out that call for the repair (RF-627): one that named an item which is still built
 * by no card, or one whose builds are no valid builds for the block (missing, empty, or naming
 * nothing uncovered, a title for example).
 */
function repairable(
  problems: readonly GapProblem[],
  uncovered: readonly CoverageItem[],
): GapProblem[] {
  const open = new Set(uncovered.map((item) => item.id));
  return problems.filter(
    (problem) => problem.field === 'builds' || problem.builds.some((id) => open.has(id)),
  );
}

/** A guard's refusal of a call, handed back; a stop of the run or a fault of the program is thrown. */
function refusalOf(calls: LinkCalls, error: unknown): RosettaError {
  if (calls.gap.signal.aborted || !(error instanceof RosettaError)) throw error;
  return error;
}

/** The gap call and, when cards were left out that named an item still open, its repair. */
async function firstRound(
  calls: LinkCalls,
  covered: PlannedCoverage,
  documents: CoverageDocuments,
): Promise<FirstRound> {
  const { specificationDriven } = calls;
  const first = await gapRound(calls.gap, covered, { specificationDriven, documents });
  const warnings = roundWarnings(first, 'gap answer', UNREADABLE_GAP);
  const leftOut = roundLeftOut(first, 'Gap answer');
  const gapped = { planned: first.planned, warnings, leftOut, problems: first.problems, rounds: 1 };
  // RF-627: once the first call covered every item there is nothing for a repair to build.
  const open = gapItems(first.planned.report);
  const problems = open.length === 0 ? [] : repairable(first.problems, open);
  const readable = first.answer !== undefined;
  if (problems.length === 0) return { gapped, readable };
  const repair = { prompt: calls.repairPrompt, problems };
  try {
    const again = await gapRound(calls.gap, first.planned, {
      ...{ specificationDriven, documents, repair },
    });
    const repaired: Gapped = {
      planned: again.planned,
      warnings: [...warnings, ...roundWarnings(again, 'gap repair answer', UNREADABLE_REPAIR)],
      leftOut: [...leftOut, ...roundLeftOut(again, 'Gap repair answer')],
      problems: [...first.problems, ...again.problems],
      rounds: 1,
    };
    return { gapped: repaired, readable: readable && again.answer !== undefined };
  } catch (error) {
    return { gapped: { ...gapped, refusal: refusalOf(calls, error) }, readable };
  }
}

/** P8-96: the second round, for only the items the first round left built by no card. */
async function secondRound(
  calls: LinkCalls,
  first: Gapped,
  documents: CoverageDocuments,
): Promise<Gapped> {
  const open = first.planned.report.uncovered.length;
  const asked = `${String(open)} item(s) were still built by no task card after the gap round, so the planner was asked once more for them.`;
  const warnings = [...first.warnings, asked];
  const { specificationDriven } = calls;
  try {
    const round = await gapRound(calls.gap, first.planned, { specificationDriven, documents });
    return {
      planned: round.planned,
      warnings: [...warnings, ...roundWarnings(round, 'second gap answer', UNREADABLE_SECOND)],
      leftOut: [...first.leftOut, ...roundLeftOut(round, 'Second gap answer')],
      problems: [...first.problems, ...round.problems],
      rounds: 2,
    };
  } catch (error) {
    return { ...first, warnings, refusal: refusalOf(calls, error) };
  }
}

/** The gap rounds for the items still uncovered after the coverage call (Q-45, P8-96). */
// Q-45, Q-54, RF-627, P8-96
export async function planGap(
  calls: LinkCalls,
  covered: PlannedCoverage,
  documents: CoverageDocuments,
): Promise<Gapped> {
  if (gapItems(covered.report).length === 0 || covered.content.phases.length === 0) {
    return { planned: covered, warnings: [], leftOut: [], problems: [], rounds: 0 };
  }
  const { gapped, readable } = await firstRound(calls, covered, documents);
  // P8-96: a module touched by no card never fails the run, so only open items ask for a second round.
  const open = gapped.planned.report.uncovered.length > 0;
  if (gapped.refusal !== undefined || !readable || !open) return gapped;
  return secondRound(calls, gapped, documents);
}
