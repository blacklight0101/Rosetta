import { rounded } from './ratio.js';

// RNF-012, RFC-001 section 7: the actual cost of a run (its `cost.json`) against the likely figure
// of the estimate made before it, as a signed error (actual - likely) / likely. Within 30 percent,
// the edge included, meets the target. A model without a price, a run that costs nothing (a local
// model) and a run without a cost report are not measured, and say why.

export const ESTIMATE_TOLERANCE = 0.3;

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
      readonly reason: 'unpriced' | 'free' | 'no-cost-report';
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
  const notMeasured = (reason: 'unpriced' | 'free' | 'no-cost-report'): EstimateAccuracy => ({
    status: 'not-measured',
    reason,
    likelyMicros,
    actualMicros,
  });
  if (!priced) return notMeasured('unpriced');
  if (actualMicros === null) return notMeasured('no-cost-report');
  if (likelyMicros === 0) return notMeasured('free');
  const error = rounded((actualMicros - likelyMicros) / likelyMicros);
  return {
    status: 'measured',
    likelyMicros,
    actualMicros,
    error,
    withinTarget: Math.abs(error) <= ESTIMATE_TOLERANCE,
  };
}
