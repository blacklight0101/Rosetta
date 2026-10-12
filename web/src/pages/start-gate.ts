import type { RunStageChoice } from '../api/runs.js';
import type { EstimateLoad } from './use-estimate.js';

// RF-1001, RF-143: whether Start can be pressed, and if not, why. The reason is the button's title
// (design-system.md section 7, "disabled with a reason"). Start stays available when the likely
// estimate is above a cap (DEC-108): only the estimate, the areas and the consent hold it back.

export interface StartGateInput {
  readonly stage: RunStageChoice;
  readonly estimate: EstimateLoad;
  readonly chosenAreas: number;
  /** Names of the providers whose notice must be confirmed; empty when none is needed. */
  readonly consentNeeded: string;
  readonly consentGiven: boolean;
}

export interface StartGate {
  readonly label: string;
  /** Why Start cannot be pressed; undefined when it can. */
  readonly reason: string | undefined;
}

function understandReason(input: StartGateInput): string | undefined {
  if (input.estimate.status === 'loading') return 'Wait for the estimate.';
  if (input.estimate.status === 'failed') return 'The estimate could not be loaded.';
  if (input.chosenAreas === 0) return 'Choose at least one area.';
  return undefined;
}

// RF-1001, RF-143
export function startGate(input: StartGateInput): StartGate {
  const plain: StartGate = { label: 'Start run', reason: undefined };
  if (input.stage === 'scan') return plain;
  const reason = understandReason(input);
  if (reason !== undefined) return { label: plain.label, reason };
  if (input.consentNeeded === '' || input.consentGiven) return plain;
  return {
    label: `Start run (confirm the ${input.consentNeeded} notice)`,
    reason: `Confirm the ${input.consentNeeded} notice above to start the run`,
  };
}
