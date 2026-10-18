import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DeepenEstimate, EstimateDeepen } from '../../application/estimate/deepen-estimate.js';
import type { ByScenario, EstimatePoint } from '../../application/estimate/estimate-types.js';
import type { StartDeepen } from '../../application/use-cases/start-deepen.js';
import { DEEPEN_ROUNDS } from '../../domain/deepen/stop-rule.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';
import { runView } from './run-view.js';

// RF-209, RF-425, RF-1105, ADR-007: the Deepen of a completed understand run.
// - POST /api/runs/:runId/deepen/estimate `{ maxRounds?, coveragePass? }` answers the estimate of the
//   first round and of all rounds against the run cap (200); nothing starts.
// - POST /api/runs/:runId/deepen `{ confirmed: true, maxRounds?, coveragePass?, cloudConsent? }`
//   starts the Deepen run (202 with the run and its queue position). Without the confirmation it
//   answers 400 (RST-2309) and starts nothing; a run that is not a completed understand run 409
//   (RST-2308); another user's run 404 like an unknown one; a round limit outside 1 to 5 400.
// Both need a session, CSRF and Origin like every POST.

export interface DeepenServices {
  readonly startDeepen: StartDeepen;
  readonly estimateDeepen: EstimateDeepen;
}

const rounds = z.number().int().min(DEEPEN_ROUNDS.min).max(DEEPEN_ROUNDS.max);
const estimateBody = z.strictObject({
  maxRounds: rounds.optional(),
  coveragePass: z.boolean().optional(),
});
const startBody = z.strictObject({
  confirmed: z.boolean(),
  maxRounds: rounds.optional(),
  coveragePass: z.boolean().optional(),
  cloudConsent: z.boolean().optional(),
});

function pointView(point: EstimatePoint): Record<string, unknown> {
  const { inputTokens, outputTokens } = point;
  return { inputTokens, outputTokens, costMicros: point.costMicros.toString() };
}

function rangeView(points: ByScenario<EstimatePoint>): Record<string, unknown> {
  return {
    low: pointView(points.low),
    likely: pointView(points.likely),
    high: pointView(points.high),
  };
}

/** Costs travel as decimal strings of micro-dollars, as in the run estimate (RF-425). */
function deepenEstimateView(estimate: DeepenEstimate): Record<string, unknown> {
  const { priceTableVersion, currency, maxRounds, coveragePass, plan, cap, overCap } = estimate;
  return {
    ...{ priceTableVersion, currency, maxRounds, coveragePass, plan, cap, overCap },
    roles: estimate.roles.map((role) => ({
      ...{ role: role.role, provider: role.provider, kind: role.kind, model: role.model },
      ...{ keySource: role.keySource, priced: role.priced },
      ...rangeView(role.points),
    })),
    round: rangeView(estimate.round),
    allRounds: rangeView(estimate.allRounds),
  };
}

// RF-209
export function registerDeepenRoutes(server: FastifyInstance, services: DeepenServices): void {
  server.post<{ Params: { runId: string } }>(
    '/api/runs/:runId/deepen/estimate',
    { config: { access: 'user' } },
    async (request, reply) => {
      const body = estimateBody.safeParse(request.body ?? {});
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.estimateDeepen.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        ...body.data,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(200).send(deepenEstimateView(outcome.value));
    },
  );

  server.post<{ Params: { runId: string } }>(
    '/api/runs/:runId/deepen',
    { config: { access: 'user' } },
    async (request, reply) => {
      const body = startBody.safeParse(request.body);
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.startDeepen.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        ...body.data,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const { run, position } = outcome.value;
      return reply.status(202).send({ ...runView(run), position: position ?? null });
    },
  );
}
