import type { RunStageChoice } from '../api/runs.js';
import type { EstimateLoad } from './use-estimate.js';

// RF-1001, RF-143, RF-128: whether Start can be pressed, and if not, why. The reason is the button's title
// (design-system.md section 7, "disabled with a reason"). Start stays available when the likely
// estimate is above a cap (DEC-108): only the estimate, the areas and the consent hold it back.

export interface StartGateInput {
  readonly stage: RunStageChoice;
  readonly estimate: EstimateLoad;
  readonly chosenAreas: number;
  /** Names of the providers whose notice must be confirmed; empty when none is needed. */
  readonly consentNeeded: string;
  readonly consentGiven: boolean;
  /** RF-132: the project is an upload and its roles send code to a cloud provider. */
  readonly privateNeeded?: boolean;
  readonly privateGiven?: boolean;
  /** RF-113: the code map is out of date and its use has not been confirmed. */
  readonly oldMapUnconfirmed?: boolean;
  /** RF-1018: library areas are chosen and the user has not confirmed reading them. */
  readonly libraryUnconfirmed?: boolean;
  /** RF-128: an upload project whose zip is not stored yet; no run can start on it. */
  readonly noSource?: boolean;
  /** RF-150: a workbook project with no batch stored yet; no run can start on it. */
  readonly noWorkbooks?: boolean;
  /** RF-431: the providers whose key is missing, named; empty or absent when every role has one. */
  readonly keyMissing?: string;
  /** RF-430: the figure the user approves, named on the button. */
  readonly approval?: string;
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
  if ((input.keyMissing ?? '') !== '') {
    return `The ${input.keyMissing ?? ''} key is missing: add your own key in Settings and keys.`;
  }
  return undefined;
}

// RF-1001, RF-143, RF-132
function missingSource(input: StartGateInput): string | undefined {
  if (input.noSource === true) return 'Upload a zip first: this project has no source.';
  if (input.noWorkbooks === true) return 'Upload workbooks first: this project has no source.';
  return undefined;
}

/** RF-430: the button names the figure the user approves. */
function approvalGate(approval: string | undefined): StartGate {
  const label = approval === undefined ? 'Analyse' : `Analyse · approve ${approval}`;
  return { label, reason: undefined };
}

export function startGate(input: StartGateInput): StartGate {
  const plain: StartGate = { label: 'Analyse', reason: undefined };
  const missing = missingSource(input);
  if (missing !== undefined) return { label: plain.label, reason: missing };
  if (input.stage === 'scan') return plain;
  const reason = understandReason(input);
  if (reason !== undefined) return { label: plain.label, reason };
  if (input.oldMapUnconfirmed === true) {
    return { label: plain.label, reason: 'Confirm the use of the old code map, or scan again.' };
  }
  if (input.libraryUnconfirmed === true) {
    return { label: plain.label, reason: 'Confirm the library areas, or choose own code only.' };
  }
  if (input.consentNeeded !== '' && !input.consentGiven) {
    return {
      label: `Analyse (confirm the ${input.consentNeeded} notice)`,
      reason: `Confirm the ${input.consentNeeded} notice above to start the run`,
    };
  }
  if (input.privateNeeded === true && input.privateGiven !== true) {
    return {
      label: 'Analyse (confirm the private code notice)',
      reason: 'Confirm the private code notice above to start the run',
    };
  }
  return approvalGate(input.approval);
}
