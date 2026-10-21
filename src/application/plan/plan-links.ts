import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { coverageOf, type CoverageItem } from '../../domain/planning/plan-coverage.js';
import { addGapTasks } from '../../domain/planning/plan-gap.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { gapMessage } from './gap-message.js';
import { parseGapAnswer, type GapAnswer, type GapProblem } from './gap-answer.js';
import { gapRepairMessage, type GapRepair } from './gap-repair-message.js';
import {
  coverageWarnings,
  planCoverage,
  type CoverageInput,
  type PlannedCoverage,
} from './plan-coverage.js';

// Q-45, Q-54, RF-627, RF-202, ADR-003, ADR-006, ADR-007: which task cards build which items of the
// package, in the calls the planner gets for it. The first links the cards it planned to the items
// (plan-coverage.ts). When items are still built by no card, the planner gets one more call that lists
// only those items and asks for task cards that build them; the cards join the plan after the last.
// When that answer left out cards that named an item still uncovered (a position written as a text,
// say), the planner gets one repair attempt: the same call for the items still uncovered, with the
// problems listed, and its cards join the plan after the others. What is still uncovered is the gap
// the run reports. Both calls go through the same guarded provider as every planner call, so the
// budget guard and the Ollama context guard (RST-1522) can refuse them; a refusal, like any failure
// of the call, keeps the plan as the calls before it left it and is handed back for the caller to end
// the run with its code. An answer that is unusable adds no card and is not a failure. Every card
// left out of an answer is reported with its position and field, never with text of the answer.

export interface PlannedLinks {
  /** The plan with its task cards, and the items still uncovered. */
  readonly planned: PlannedCoverage;
  /** What to log: cards left out, an answer that could not be read, and the items no card builds. */
  readonly warnings: readonly string[];
  /** Why the extra call was not served; the plan is then the one the calls before it left. */
  readonly refusal?: RosettaError;
}

export interface LinkCalls {
  readonly coverage: PlannerCall;
  readonly gap: PlannerCall;
  /** Q-54: the versioned prompt that asks for the cards again, with the problems listed. */
  readonly repairPrompt: PromptFile;
  /** RF-607: given SDD, a task card that implements no requirement is not written. */
  readonly specificationDriven: boolean;
}

const UNREADABLE_GAP =
  'The planner answer with the task cards for the items no card builds could not be read; none was added.';
const UNREADABLE_REPAIR =
  'The planner answer with the repaired task cards for the items no card builds could not be read; none was added.';

interface Round {
  readonly planned: PlannedCoverage;
  /** Undefined when the answer was no list of cards. */
  readonly answer: GapAnswer | undefined;
}

interface RoundOptions {
  readonly specificationDriven: boolean;
  /** Set for the repair attempt: the prompt and the problems that go after the data. */
  readonly repair?: GapRepair;
}

/** One call for the items still uncovered, its cards added to the plan; the repair lists problems. */
async function gapRound(
  call: PlannerCall,
  planned: PlannedCoverage,
  options: RoundOptions,
): Promise<Round> {
  const { content, report } = planned;
  const input = { items: report.uncovered, content };
  const { repair, specificationDriven } = options;
  const message =
    repair === undefined
      ? gapMessage(input, call.tags)
      : gapRepairMessage(input, repair, call.tags);
  const answer = parseGapAnswer(await askPlannerWith(call, message));
  const drafts = answer?.drafts ?? [];
  const grown = addGapTasks(content, drafts, report.uncovered, { specificationDriven });
  const closed = { ...planned, content: grown, report: coverageOf(report.items, grown.tasks) };
  return { planned: closed, answer };
}

/** What to log about an answer: the cards left out, by position and field, or that it was no answer. */
function roundWarnings(round: Round, label: string, unreadable: string): string[] {
  if (round.answer === undefined) return [unreadable];
  return round.answer.problems.map(
    ({ position, field, reason }) =>
      `Task card at position ${String(position)} of the ${label} was left out: the field "${field}" ${reason}.`,
  );
}

/** The cards left out that named an item which is still built by no card. */
function namedGaps(
  answer: GapAnswer | undefined,
  uncovered: readonly CoverageItem[],
): GapProblem[] {
  const open = new Set(uncovered.map((item) => item.id));
  return (answer?.problems ?? []).filter((problem) => problem.builds.some((id) => open.has(id)));
}

/** The call for the items still uncovered and, when cards were left out that named one, the repair. */
async function planGap(calls: LinkCalls, covered: PlannedCoverage): Promise<PlannedLinks> {
  const { specificationDriven } = calls;
  if (covered.report.uncovered.length === 0 || covered.content.phases.length === 0) {
    return { planned: covered, warnings: [] };
  }
  const first = await gapRound(calls.gap, covered, { specificationDriven });
  const warnings = roundWarnings(first, 'gap answer', UNREADABLE_GAP);
  const problems = namedGaps(first.answer, first.planned.report.uncovered);
  if (problems.length === 0) return { planned: first.planned, warnings };
  const repair = { prompt: calls.repairPrompt, problems };
  try {
    const second = await gapRound(calls.gap, first.planned, { specificationDriven, repair });
    const again = roundWarnings(second, 'gap repair answer', UNREADABLE_REPAIR);
    return { planned: second.planned, warnings: [...warnings, ...again] };
  } catch (error) {
    if (calls.gap.signal.aborted || !(error instanceof RosettaError)) throw error;
    return { planned: first.planned, warnings, refusal: error };
  }
}

// Q-45, Q-54, RF-627
export async function planLinks(calls: LinkCalls, input: CoverageInput): Promise<PlannedLinks> {
  const covered = await planCoverage(calls.coverage, input);
  try {
    const gap = await planGap(calls, covered);
    const warnings = [...gap.warnings, ...coverageWarnings(gap.planned)];
    return { ...gap, warnings };
  } catch (error) {
    if (calls.gap.signal.aborted || !(error instanceof RosettaError)) throw error;
    return { planned: covered, warnings: coverageWarnings(covered), refusal: error };
  }
}
