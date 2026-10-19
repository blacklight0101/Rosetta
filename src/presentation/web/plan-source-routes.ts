import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GetPlanSource } from '../../application/use-cases/get-plan-source.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-614, RF-605, RF-1105: the understand run Plan setup plans from. GET /api/projects/:id/plan-source
// answers `{ runId, runKey, endedAt, areas, supportedClaims, newest }` for the run named by `?run=`
// (a run id), or for the project's newest understand run that ended `Completed` when none is named.
// It needs a session. Another user's project, an unknown run id, another user's run and a run of
// another project answer 404; a run that did not complete, or one with no supported claim, and a
// project with no such run answer 409 (RST-1802); a run id longer than an id answers 400.

export interface PlanSourceServices {
  readonly getPlanSource: Pick<GetPlanSource, 'execute'>;
}

/** The `?run=` of the plan routes: a run id, a few dozen characters at most. */
export const sourceRunQuery = z.object({ run: z.string().min(1).max(64).optional() });

// RF-614
export function registerPlanSourceRoutes(
  server: FastifyInstance,
  services: PlanSourceServices,
): void {
  server.get<{ Params: { id: string }; Querystring: unknown }>(
    '/api/projects/:id/plan-source',
    { config: { access: 'user' } },
    async (request, reply) => {
      const query = sourceRunQuery.safeParse(request.query);
      if (!query.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const { run } = query.data;
      const outcome = await services.getPlanSource.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        ...(run === undefined ? {} : { runId: run }),
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const { endedAt, ...rest } = outcome.value;
      const view = { ...rest, endedAt: endedAt === null ? null : new Date(endedAt).toISOString() };
      return reply.header('cache-control', 'no-store').status(200).send(view);
    },
  );
}
