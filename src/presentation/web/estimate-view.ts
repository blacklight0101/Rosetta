import type {
  ByScenario,
  EstimatePoint,
  RunEstimate,
} from '../../application/estimate/estimate-types.js';

// RF-425: what `GET /api/projects/:id/estimate` shows. Costs are micro-dollars and travel as
// decimal strings, so none is rounded (the same as the caps API).

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

// RF-425
export function estimateView(estimate: RunEstimate): Record<string, unknown> {
  const { priceTableVersion, currency, areas, assumptions } = estimate;
  return {
    ...{ priceTableVersion, currency, areas, assumptions },
    codeMap: estimate.codeMap,
    roles: estimate.roles.map((role) => ({
      ...{ role: role.role, provider: role.provider, kind: role.kind, model: role.model },
      ...{ keySource: role.keySource, priced: role.priced },
      ...(role.reasoningEffort === undefined ? {} : { reasoningEffort: role.reasoningEffort }),
      ...rangeView(role.points),
    })),
    total: rangeView(estimate.total),
  };
}
