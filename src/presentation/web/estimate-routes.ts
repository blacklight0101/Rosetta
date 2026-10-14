import type { FastifyInstance } from 'fastify';
import type { EstimateRun } from '../../application/estimate/estimate-run.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { START_BODY_LIMIT_BYTES } from './area-limits.js';
import { estimateBody, refuseEstimateQuery } from './estimate-request.js';
import { estimateView } from './estimate-view.js';
import { signedInOf } from './request-actor.js';

// RF-425, RF-1105: the estimate of an understand run. GET /api/projects/:id/estimate answers for
// every area; POST /api/projects/:id/estimate with `{ "areas": [...] }` answers for those alone (an
// unknown name is RST-1307, 400). Both need a session, the POST also CSRF and Origin; a project
// without a completed scan answers 409 (RST-1203), another user's project 404.

export interface EstimateServices {
  readonly estimateRun: EstimateRun;
}

async function answer(
  services: EstimateServices,
  request: Parameters<typeof signedInOf>[0],
  projectId: string,
  areas: readonly string[] | undefined,
): Promise<Record<string, unknown>> {
  const outcome = await services.estimateRun.execute({
    actor: signedInOf(request).actor,
    projectId,
    ...(areas === undefined ? {} : { areas }),
  });
  if (!outcome.ok) throw new RosettaError(outcome.error);
  return estimateView(outcome.value);
}

// RF-425
export function registerEstimateRoutes(server: FastifyInstance, services: EstimateServices): void {
  server.get<{ Params: { id: string } }>(
    '/api/projects/:id/estimate',
    { config: { access: 'user' } },
    async (request, reply) => {
      refuseEstimateQuery(request.query);
      return reply.status(200).send(await answer(services, request, request.params.id, undefined));
    },
  );

  server.post<{ Params: { id: string } }>(
    '/api/projects/:id/estimate',
    { bodyLimit: START_BODY_LIMIT_BYTES, config: { access: 'user' } },
    async (request, reply) => {
      const body = estimateBody.safeParse(request.body);
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const view = await answer(services, request, request.params.id, body.data.areas);
      return reply.status(200).send(view);
    },
  );
}
