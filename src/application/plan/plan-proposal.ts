import { legacyFactsOf } from '../../domain/planning/application-kind.js';
import { proposeFor, type PlanProposal } from '../../domain/planning/stack-proposal.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { StackData } from '../../domain/planning/stack-data.js';
import type { PlanInputs } from './plan-inputs.js';
import { scanOfSourceRun, type PlanShapeDependencies } from './plan-shapes.js';

// P5-39, DEC-172, RF-609, RF-610: the plan proposes the kind of application, the open stack layers and a
// migration strategy that fits, from the newest completed scan of the snapshot the cards were read
// at. Without a readable scan, and for workbooks (no web or desktop application), nothing is
// proposed: the package is written from the brief as saved.

export interface PlanProposed {
  readonly inputs: PlanInputs;
  /** Undefined when nothing could be proposed; the inputs are then the saved ones. */
  readonly proposal: PlanProposal | undefined;
  /** The scan this read, handed on so the rest of the run does not open it a second time. */
  readonly scans: ScanResults;
}

/** The inputs with the proposals in the brief, and the proposal; the saved inputs when none could be made. */
// RF-609
export async function planProposal(
  deps: PlanShapeDependencies,
  inputs: PlanInputs,
  stack: StackData,
): Promise<PlanProposed> {
  const none = { inputs, proposal: undefined, scans: deps.scans };
  if (inputs.project.sourceKind === 'workbook') return none;
  const scan = await scanOfSourceRun(deps, inputs);
  if (scan === undefined) return none;
  try {
    const opened = await deps.scans.open(scan);
    const { codeMap } = opened;
    const facts = legacyFactsOf(codeMap, stack.proposals.signals);
    const proposed = proposeFor(inputs.brief, facts, stack);
    return {
      inputs: { ...inputs, brief: proposed.brief },
      proposal: proposed.proposal,
      scans: { open: () => Promise.resolve(opened) },
    };
  } catch {
    // shapes.md's own read of the scan logs the failure; with no code map nothing is proposed.
    return none;
  }
}
