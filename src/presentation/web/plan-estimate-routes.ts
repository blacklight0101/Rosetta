import type { FastifyInstance } from 'fastify';
import type { EstimatePlan } from '../../application/estimate/estimate-plan.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { sourceRunQuery } from './plan-source-routes.js';
import { planEstimateView } from './plan-estimate-view.js';
import { signedInOf } from './request-actor.js';

// RF-613, RF-1105: the estimate of a plan run. GET /api/projects/:id/plan-estimate answers the
// planner's call as a low, likely and high figure against the caps the budget guard will check it
// against. `?run=<run id>` (RF-614) measures it from that understand run, the project's newest
// completed one when absent; another user's run id answers 404. It needs a session; a project
// without a saved planning brief answers 409 (RST-1801), one without a finished understand run that
// holds a supported claim 409 (RST-1802), and another user's project 404.

export interface PlanEstimateServices {
  readonly estimatePlan: EstimatePlan;
}

// RF-613
export function registerPlanEstimateRoutes(
  server: FastifyInstance,
  services: PlanEstimateServices,
): void {
  server.get<{ Params: { id: string }; Querystring: unknown }>(
    '/api/projects/:id/plan-estimate',
    { config: { access: 'user' } },
    async (request, reply) => {
      const query = sourceRunQuery.safeParse(request.query);
      if (!query.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const { run } = query.data;
      const outcome = await services.estimatePlan.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        ...(run === undefined ? {} : { sourceRunId: run }),
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const view = planEstimateView(outcome.value);
      return reply.header('cache-control', 'no-store').status(200).send(view);
    },
  );
}
