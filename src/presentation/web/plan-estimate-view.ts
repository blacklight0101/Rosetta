import type { ByScenario, EstimatePoint } from '../../application/estimate/estimate-types.js';
import type { PlanEstimate } from '../../application/estimate/plan-estimate-types.js';

// RF-613: what `GET /api/projects/:id/plan-estimate` shows. Costs, limits and spend are
// micro-dollars or tokens and travel as decimal strings, so none is rounded (the same as the caps
// API).

function pointView(point: EstimatePoint): Record<string, unknown> {
  return {
    inputTokens: point.inputTokens,
    outputTokens: point.outputTokens,
    costMicros: point.costMicros.toString(),
  };
}

function rangeView(points: ByScenario<EstimatePoint>): Record<string, unknown> {
  return {
    low: pointView(points.low),
    likely: pointView(points.likely),
    high: pointView(points.high),
  };
}

// RF-613
export function planEstimateView(estimate: PlanEstimate): Record<string, unknown> {
  const { priceTableVersion, currency, planner, assumptions, withinCaps } = estimate;
  const { keyAvailable } = estimate;
  return {
    ...{ priceTableVersion, currency, assumptions, withinCaps, keyAvailable },
    planner: {
      ...{ role: planner.role, provider: planner.provider, kind: planner.kind },
      ...{ model: planner.model, keySource: planner.keySource, priced: planner.priced },
      ...rangeView(planner.points),
    },
    caps: estimate.caps.map((cap) => ({
      ...{ kind: cap.kind, unit: cap.unit, fits: cap.fits },
      limit: cap.limit.toString(),
      spent: cap.spent.toString(),
      remaining: cap.remaining.toString(),
    })),
  };
}
