import type { RunEstimate } from '../api/estimate-schemas.js';
import { dollars, ownKeyTotal, pricedTotal } from './estimate-math.js';

// RF-1001, DEC-108: when the likely estimate is above a cap, a warning names the cap and how far
// the estimate is over it. Start stays available: the budget guard stops the run cleanly at the cap
// (RF-422). Only the caps the page can read are compared: the run cap of the project (editable on
// the page) and the user's daily cap on their own keys. What was already spent today or this month
// is not readable yet (the cost totals are card P1-36), so these compare with the whole cap, never
// with less than what remains.

export interface CapWarning {
  readonly id: 'run' | 'own-day';
  readonly text: string;
}

interface CapInputs {
  readonly estimate: RunEstimate;
  readonly runCapMicros: bigint;
  /** The daily cap on the user's own keys; null when there is none. */
  readonly ownDailyCapMicros: bigint | null;
}

const stops = 'Start stays available; the run stops cleanly when it reaches a cap.';

// RF-1001, DEC-108
export function capWarnings(inputs: CapInputs): readonly CapWarning[] {
  const { estimate, runCapMicros, ownDailyCapMicros } = inputs;
  const warnings: CapWarning[] = [];
  const likely = pricedTotal(estimate, 'likely');
  if (likely > runCapMicros) {
    warnings.push({
      id: 'run',
      text:
        `The likely estimate, ${dollars(likely)}, is ${dollars(likely - runCapMicros)} over the ` +
        `run cap of ${dollars(runCapMicros)}. ${stops}`,
    });
  }
  const own = ownKeyTotal(estimate, 'likely');
  if (ownDailyCapMicros !== null && own > ownDailyCapMicros) {
    warnings.push({
      id: 'own-day',
      text:
        `The likely estimate on your own keys, ${dollars(own)}, is ${dollars(own - ownDailyCapMicros)} ` +
        `over your daily cap of ${dollars(ownDailyCapMicros)}. ${stops}`,
    });
  }
  return warnings;
}
