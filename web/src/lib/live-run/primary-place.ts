import { isResumable } from './resumable.js';

// RF-1021, RF-006, RF-615 (P8-84): the page of an understand run that has ended has one primary
// action, and this says where it is. A run that stopped (at its cap, failed or interrupted) is
// resumed first: Resume in the page head. A run that completed with a Supported claim goes on from
// Your turn (Deepen while its own code was read below the bar, else Set up the plan). Any other run
// (it completed with no Supported claim) has its next action in the journey strip ("Start a new
// run"). Elsewhere the journey strip and Your turn draw their actions as secondary buttons or links.

export type PrimaryPlace = 'head' | 'turn' | 'strip';

export function primaryPlaceOf(
  endState: string | undefined,
  supportedClaims: number,
): PrimaryPlace {
  if (endState !== undefined && isResumable('understand', endState)) return 'head';
  return endState === 'Completed' && supportedClaims > 0 ? 'turn' : 'strip';
}
