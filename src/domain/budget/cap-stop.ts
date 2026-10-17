import { ERROR_CODES } from '../errors/codes.js';
import { RosettaError } from '../errors/rosetta-error.js';

// RF-422, ADR-007: a cap refusal stops the whole run through its one abort signal, with the
// refusal (RST-1600) as the reason. Tasks then end `StoppedByCap` and the run `CapReached`; any
// other stop (the user's Stop, a shutdown) stays a stop.

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
