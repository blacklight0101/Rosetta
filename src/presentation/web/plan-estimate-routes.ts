import type { FastifyInstance } from 'fastify';
import type { EstimatePlan } from '../../application/estimate/estimate-plan.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { planEstimateView } from './plan-estimate-view.js';
import { signedInOf } from './request-actor.js';

// RF-613, RF-1105: the estimate of a plan run. GET /api/projects/:id/plan-estimate answers the
// planner's call as a low, likely and high figure against the caps the budget guard will check it
// against. It needs a session; a project without a saved planning brief answers 409 (RST-1801), one
// without a finished understand run that holds a supported claim 409 (RST-1802), and another user's
// project 404.

export interface PlanEstimateServices {
  readonly estimatePlan: EstimatePlan;
}

// RF-613
export function registerPlanEstimateRoutes(
  server: FastifyInstance,
  services: PlanEstimateServices,
): void {
  server.get<{ Params: { id: string } }>(
    '/api/projects/:id/plan-estimate',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.estimatePlan.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const view = planEstimateView(outcome.value);
      return reply.header('cache-control', 'no-store').status(200).send(view);
    },
  );
}
