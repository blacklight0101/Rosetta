import type { RunEstimate } from '../api/estimate-schemas.js';
import type { SpendLimits } from '../api/limits-schemas.js';
import { dollars, ownKeyTotal, pricedTotal, serverKeyTotal } from './estimate-math.js';

// RF-1001, RF-1106, DEC-107, DEC-108: when the likely estimate is above a cap, a warning names the
// cap and how far the estimate is over what is left of it. Start stays available: the budget guard
// stops the run cleanly at the cap (RF-422). Four caps are compared, each with the part of the
// estimate it limits: the run cap of the project (editable on the page) with the whole estimate; the
// user's day and the server's month, as the server reports what is left of them, with the roles on
// the server's key; the user's own daily cap, as far as it is left, with the roles on their own key.
// A limit the page could not read (undefined) is left out, never guessed.

export interface CapWarning {
  readonly id: 'run' | 'user-day' | 'server-month' | 'own-day';
  readonly text: string;
}

interface CapInputs {
  readonly estimate: RunEstimate;
  readonly runCapMicros: bigint;
  /** What is left of each cap, from the server; undefined while unknown. */
  readonly limits: SpendLimits | undefined;
}

const stops = 'Start stays available; the run stops cleanly when it reaches a cap.';

/** `$0.39, is $0.19 over what is left`: the estimate and how far it is over what remains. */
function over(likely: bigint, left: bigint): string {
  return `${dollars(likely)}, is ${dollars(likely - left)} over what is left`;
}

function runWarning(estimate: RunEstimate, capMicros: bigint): CapWarning | undefined {
  const likely = pricedTotal(estimate, 'likely');
  if (likely <= capMicros) return undefined;
  return {
    id: 'run',
    text:
      `The likely estimate, ${dollars(likely)}, is ${dollars(likely - capMicros)} over the ` +
      `run cap of ${dollars(capMicros)}. ${stops}`,
  };
}

function serverWarnings(estimate: RunEstimate, limits: SpendLimits): CapWarning[] {
  const likely = serverKeyTotal(estimate, 'likely');
  const { userDay, serverMonth } = limits.serverKeys;
  const warnings: CapWarning[] = [];
  if (likely > userDay.remainingMicros) {
    warnings.push({
      id: 'user-day',
      text:
        `The likely estimate on the server's keys, ${over(likely, userDay.remainingMicros)} of ` +
        `your daily cap today: ${dollars(userDay.remainingMicros)} left of ` +
        `${dollars(userDay.capMicros)}. ${stops}`,
    });
  }
  if (likely > serverMonth.remainingMicros) {
    warnings.push({
      id: 'server-month',
      text:
        `The likely estimate on the server's keys, ${over(likely, serverMonth.remainingMicros)} of ` +
        `the server's monthly cap: ${dollars(serverMonth.remainingMicros)} left this month. ${stops}`,
    });
  }
  return warnings;
}

function ownWarning(estimate: RunEstimate, limits: SpendLimits): CapWarning[] {
  const day = limits.ownKeys.day;
  const likely = ownKeyTotal(estimate, 'likely');
  if (day === null || likely <= day.remainingMicros) return [];
  return [
    {
      id: 'own-day',
      text:
        `The likely estimate on your own keys, ${over(likely, day.remainingMicros)} of your ` +
        `daily cap on your own keys: ${dollars(day.remainingMicros)} left of ` +
        `${dollars(day.capMicros)}. ${stops}`,
    },
  ];
}

// RF-1001, RF-1106, DEC-108
export function capWarnings(inputs: CapInputs): readonly CapWarning[] {
  const { estimate, runCapMicros, limits } = inputs;
  const run = runWarning(estimate, runCapMicros);
  const limited =
    limits === undefined
      ? []
      : [...serverWarnings(estimate, limits), ...ownWarning(estimate, limits)];
  return run === undefined ? limited : [run, ...limited];
}
