import { ERROR_CODES } from '../errors/codes.js';
import { RosettaError } from '../errors/rosetta-error.js';

// RF-422, ADR-007: a cap refusal stops the whole run through its one abort signal, with the
// refusal (RST-1600) as the reason. Tasks then end `StoppedByCap` and the run `CapReached`; any
// other stop (the user's Stop, a shutdown) stays a stop.

/**
 * RF-432, ADR-026: the stop of a run that reached its approved amount. It is a cap stop (RST-1600),
 * so every task ends and saves its work exactly as at a cap; only the queue state differs: the run
 * waits for its owner's answer instead of ending.
 */
export class ApprovalPause extends RosettaError {
  constructor() {
    super(
      ERROR_CODES.budgetCapReached,
      'The run reached the amount you approved and waits for your approval.',
    );
    this.name = 'ApprovalPause';
  }
}

// RF-432
export function isApprovalPause(reason: unknown): reason is ApprovalPause {
  return reason instanceof ApprovalPause;
}

// RF-422
export function isCapStop(reason: unknown): boolean {
  return reason instanceof RosettaError && reason.code === ERROR_CODES.budgetCapReached;
}

/**
 * RF-422, RF-250, P2-35: whether a cap that refuses a call of this role stops the whole run. The
 * summariser's merge is an optional step after every reader has ended, so its refusal is recorded
 * and reported like any other but ends the step only: the run ends as it would without it.
 */
// RF-422
export function capStopsRun(role: string): boolean {
  return role !== 'summariser';
}
