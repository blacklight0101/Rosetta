import type { FastifyInstance } from 'fastify';
import type { Journey, JourneyRun } from '../../application/journey/journey.js';
import type { GetJourney } from '../../application/use-cases/get-journey.js';
import type { EpochMs } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { sourceRunQuery } from './plan-source-routes.js';
import { signedInOf } from './request-actor.js';

// RF-615, RF-614, RF-1105, DEC-142: GET /api/projects/:id/journey gives the journey strip its facts:
// `{ source, scanRunId, briefSaved, plan, handoff }`. The page is about the understand or the plan
// run named by `?run=` (a run id), or about the newest completed understand run of the project when
// none is named. It needs a session. Another user's project or run, a run of another project and a
// run of another stage answer 404; a run id longer than an id answers 400.

export interface JourneyServices {
  readonly getJourney: Pick<GetJourney, 'execute'>;
}

const instantOrNull = (at: EpochMs | null): string | null =>
  at === null ? null : new Date(at).toISOString();

function runView(run: JourneyRun): Record<string, unknown> {
  return { ...run, endedAt: instantOrNull(run.endedAt) };
}

function journeyView(journey: Journey): Record<string, unknown> {
  const { source, plan } = journey;
  return {
    ...journey,
    source: source === null ? null : runView(source),
    plan: plan === null ? null : runView(plan),
  };
}

// RF-615
export function registerJourneyRoutes(server: FastifyInstance, services: JourneyServices): void {
  server.get<{ Params: { id: string }; Querystring: unknown }>(
    '/api/projects/:id/journey',
    { config: { access: 'user' } },
    async (request, reply) => {
      const query = sourceRunQuery.safeParse(request.query);
      if (!query.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.getJourney.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        runId: query.data.run,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.header('cache-control', 'no-store').status(200).send(journeyView(outcome.value));
    },
  );
}
