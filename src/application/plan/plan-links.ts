import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { coverageOf } from '../../domain/planning/plan-coverage.js';
import { addGapTasks } from '../../domain/planning/plan-gap.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { gapMessage } from './gap-message.js';
import { parseGapAnswer } from './gap-answer.js';
import {
  coverageWarnings,
  planCoverage,
  type CoverageInput,
  type PlannedCoverage,
} from './plan-coverage.js';

// Q-45, RF-627, ADR-003, ADR-006, ADR-007: which task cards build which items of the package, in the
// two calls the planner gets for it. The first links the cards it planned to the items (plan-coverage.ts).
// When items are still built by no card, the planner gets one more call that lists only those items and
// asks for task cards that build them; the cards join the plan after the last, and what is still
// uncovered is the gap the run reports. The extra call goes through the same guarded provider as every
// planner call, so the budget guard and the Ollama context guard (RST-1522) can refuse it; a refusal,
// like any failure of that call, keeps the plan as the first call left it and is handed back for the
// caller to end the run with its code. An answer that is unusable adds no card and is not a failure.

export interface PlannedLinks {
  /** The plan with its task cards, and the items still uncovered. */
  readonly planned: PlannedCoverage;
  /** What to log: an answer that could not be read, and the items no card builds. */
  readonly warnings: readonly string[];
  /** Why the extra call was not served; the plan is then the one the first call left. */
  readonly refusal?: RosettaError;
}

export interface LinkCalls {
  readonly coverage: PlannerCall;
  readonly gap: PlannerCall;
  /** RF-607: given SDD, a task card that implements no requirement is not written. */
  readonly specificationDriven: boolean;
}

const UNREADABLE_GAP =
  'The planner answer with the task cards for the items no card builds could not be read; none was added.';

/** One more call for the items still uncovered; the plan as it was when there is none or no phase. */
async function planGap(
  call: PlannerCall,
  planned: PlannedCoverage,
  specificationDriven: boolean,
): Promise<{ readonly planned: PlannedCoverage; readonly readable: boolean }> {
  const { content, report } = planned;
  if (report.uncovered.length === 0 || content.phases.length === 0) {
    return { planned, readable: true };
  }
  const answer = await askPlannerWith(
    call,
    gapMessage({ items: report.uncovered, content }, call.tags),
  );
  const drafts = parseGapAnswer(answer);
  const grown = addGapTasks(content, drafts ?? [], report.uncovered, { specificationDriven });
  const closed = { ...planned, content: grown, report: coverageOf(report.items, grown.tasks) };
  return { planned: closed, readable: drafts !== undefined };
}

// Q-45, RF-627
export async function planLinks(calls: LinkCalls, input: CoverageInput): Promise<PlannedLinks> {
  const covered = await planCoverage(calls.coverage, input);
  try {
    const gap = await planGap(calls.gap, covered, calls.specificationDriven);
    const unreadable = gap.readable ? [] : [UNREADABLE_GAP];
    return { planned: gap.planned, warnings: [...unreadable, ...coverageWarnings(gap.planned)] };
  } catch (error) {
    if (calls.gap.signal.aborted || !(error instanceof RosettaError)) throw error;
    return { planned: covered, warnings: coverageWarnings(covered), refusal: error };
  }
}
