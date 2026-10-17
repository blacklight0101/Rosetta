import { rounded } from './ratio.js';

// RNF-012, RFC-001 section 7: the actual cost of a run (its `cost.json`) against the likely figure
// of the estimate made before it, as a signed error (actual - likely) / likely. Within 30 percent,
// the edge included, meets the target; the error is compared before it is rounded for the file. A
// model without a price, a run that costs nothing (a local model), a priced estimate of zero for a
// run that cost money and a run without a cost report are not measured, and say why.

export const ESTIMATE_TOLERANCE = 0.3;

/** Why a run's estimate is not measured. */
export const NOT_MEASURED = ['unpriced', 'free', 'zero-estimate', 'no-cost-report'] as const;
type NotMeasured = (typeof NOT_MEASURED)[number];

export type EstimateAccuracy =
  | {
      readonly status: 'measured';
      readonly likelyMicros: number;
      readonly actualMicros: number;
      readonly error: number;
      readonly withinTarget: boolean;
    }
  | {
      readonly status: 'not-measured';
      readonly reason: NotMeasured;
      readonly likelyMicros: number;
      readonly actualMicros: number | null;
    };

export interface EstimateFigures {
  readonly likelyMicros: number;
  /** False when a role's model has no price: the estimate's cost is then unknown. */
  readonly priced: boolean;
  /** `totals.costMicros` of the run's `cost.json`; null when the run wrote none. */
  readonly actualMicros: number | null;
}

// RNF-012
export function estimateAccuracy(figures: EstimateFigures): EstimateAccuracy {
  const { likelyMicros, priced, actualMicros } = figures;
  const notMeasured = (reason: NotMeasured): EstimateAccuracy => ({
    status: 'not-measured',
    reason,
    likelyMicros,
    actualMicros,
  });
  if (!priced) return notMeasured('unpriced');
  if (actualMicros === null) return notMeasured('no-cost-report');
  if (likelyMicros === 0) return notMeasured(actualMicros === 0 ? 'free' : 'zero-estimate');
  const error = (actualMicros - likelyMicros) / likelyMicros;
  return {
    status: 'measured',
    likelyMicros,
    actualMicros,
    error: rounded(error),
    withinTarget: Math.abs(error) <= ESTIMATE_TOLERANCE,
  };
}
