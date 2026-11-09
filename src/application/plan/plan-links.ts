import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { coverageOf, type CoverageDocuments } from '../../domain/planning/plan-coverage.js';
import { settleDerivedRequirements } from '../../domain/planning/derived-requirements.js';
import type { LeftOutCard } from '../../domain/planning/left-out-card.js';
import type { ModuleReason } from '../../domain/planning/module-coverage.js';
import { titlePhases } from '../../domain/planning/phase-titles.js';
import { planGap, type LinkCalls } from './gap-rounds.js';
import { moduleReasons } from './module-reasons.js';
import type { HandoffPackage } from './handoff-package.js';
import {
  coverageWarnings,
  planCoverage,
  type CoverageInput,
  type PlannedCoverage,
} from './plan-coverage.js';

// Q-45, Q-54, RF-627, RF-202, ADR-003, ADR-006, ADR-007: which task cards build which items of the
// package, in the calls the planner gets for it. The first links the cards it planned to the items
// (plan-coverage.ts). When items are still built by no card, the gap rounds ask for task cards that
// build only those items, or for links to cards the plan has (gap-rounds.ts: the gap call, its one
// repair attempt and, P8-96, one second round when items are still open); the cards join the plan
// after the last. What is still uncovered after them is the gap the run reports. Every call goes
// through the same guarded provider as every planner call, so the budget guard and the Ollama
// context guard (RST-1522) can refuse it; a refusal, like any failure of the call, keeps the plan as
// the calls before it left it and is handed back for the caller to end the run with its code. An
// answer that is unusable adds no card and is not a failure. Every card left out of an answer is
// reported with its position and field, never with text of the answer.

export interface PlannedLinks {
  /** The plan with its task cards, and the items still uncovered. */
  readonly planned: PlannedCoverage;
  /** What to log: cards left out, an answer that could not be read, and the items no card builds. */
  readonly warnings: readonly string[];
  /** P7-14: the cards the gap and repair answers left out, or kept with entries dropped, for checks.md. */
  readonly leftOut: HandoffPackage['leftOut'];
  /** Why the extra call was not served; the plan is then the one the calls before it left. */
  readonly refusal?: RosettaError;
  /** P8-06: why each module or the deployment material has no task card, for checks.md. */
  readonly moduleReasons: readonly ModuleReason[];
  /** P8-96: how many gap rounds ran (0, 1 or 2), for the run's record. */
  readonly gapRounds: number;
}

/** P5-40: the phases named after the cards they hold, once the last card has joined the plan. */
function titled(planned: PlannedCoverage): PlannedCoverage {
  return { ...planned, content: titlePhases(planned.content) };
}

interface Settled {
  readonly covered: PlannedCoverage;
  readonly warnings: readonly string[];
  readonly leftOut: HandoffPackage['leftOut'];
}

/**
 * P8-02, RF-607: once the cards are linked, a package card that named no requirement takes them
 * from what it builds; one with nothing to derive is left out, logged and listed in checks.md.
 */
function settled(linked: PlannedCoverage, documents: CoverageDocuments): Settled {
  const derived = settleDerivedRequirements(linked.content, documents);
  if (derived.content === linked.content) return { covered: linked, warnings: [], leftOut: [] };
  const { leftOut } = derived;
  const { content } = derived;
  const covered = { ...linked, content, report: coverageOf(linked.report.items, content.tasks) };
  const rows = leftOut.map(({ position, field, reason }: LeftOutCard) => ({
    ...{ area: 'Task cards', item: String(position), field, reason },
  }));
  const warnings = leftOut.map(
    ({ position, field, reason }) =>
      `Task card at position ${String(position)} of the plan answer was left out (the field "${field}"). ${reason}`,
  );
  return { covered, warnings, leftOut: rows };
}

// Q-45, Q-54, RF-627, P8-06, P8-96
export async function planLinks(calls: LinkCalls, input: CoverageInput): Promise<PlannedLinks> {
  const linked = await planCoverage(calls.coverage, input);
  const { covered, warnings, leftOut } = settled(linked, input.documents);
  const asked = covered.content.phases.length > 0;
  const { modules } = input.documents;
  try {
    const { problems, rounds: gapRounds, ...gap } = await planGap(calls, covered, input.documents);
    const planned = titled(gap.planned);
    const rounds = { asked, refused: gap.refusal !== undefined, problems };
    return {
      ...gap,
      planned,
      warnings: [...warnings, ...gap.warnings, ...coverageWarnings(planned)],
      leftOut: [...leftOut, ...gap.leftOut],
      moduleReasons: moduleReasons(planned.report.modules, rounds, modules),
      gapRounds,
    };
  } catch (error) {
    if (calls.gap.signal.aborted || !(error instanceof RosettaError)) throw error;
    const planned = titled(covered);
    const all = [...warnings, ...coverageWarnings(planned)];
    const rounds = { asked, refused: true, problems: [] };
    const reasons = moduleReasons(planned.report.modules, rounds, modules);
    return {
      planned,
      warnings: all,
      leftOut,
      refusal: error,
      moduleReasons: reasons,
      gapRounds: 0,
    };
  }
}
