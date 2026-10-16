import type { FastifyInstance } from 'fastify';
import { parseBriefAnswers } from '../../application/planning/planning-brief-schema.js';
import type { PlanningBriefState } from '../../application/planning/planning-brief-state.js';
import type { GetPlanningBrief } from '../../application/use-cases/get-planning-brief.js';
import type { SavePlanningBrief } from '../../application/use-cases/save-planning-brief.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { FieldProblemsError } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-605, RF-1105, DEC-80: the planning brief of a project, saved by Plan setup.
// - GET /api/projects/:id/planning-brief answers `{ saved, outOfDate, brief }`: the saved brief, or
//   the default of every question while none is saved (`saved` false, `brief.savedAt` null).
//   `outOfDate` is true when the brief was saved after the newest finished package began.
// - PUT /api/projects/:id/planning-brief with the answers (`principles`, `architecture`,
//   `migration`, `stack`, `context`, `buildMethod`, each optional) stores the brief and answers like
//   the GET. A question left out takes its default and is listed in `brief.defaulted`; a body that
//   breaks the shape or a limit answers 400 (RST-2000) and an unknown principle or a repeated layer
//   400 with its field; nothing is written then.
// Another user's project id answers 404 like an unknown one.

export interface PlanningBriefServices {
  readonly getPlanningBrief: GetPlanningBrief;
  readonly savePlanningBrief: SavePlanningBrief;
}

const BODY_LIMIT_BYTES = 64 * 1024;

interface IdParams {
  readonly id: string;
}

function view(state: PlanningBriefState): Record<string, unknown> {
  const savedAt = 'savedAt' in state.brief ? state.brief.savedAt : null;
  return {
    saved: state.saved,
    outOfDate: state.outOfDate,
    brief: { ...state.brief, savedAt },
  };
}

// RF-605, RF-1105
export function registerPlanningBriefRoutes(
  server: FastifyInstance,
  services: PlanningBriefServices,
): void {
  server.get<{ Params: IdParams }>(
    '/api/projects/:id/planning-brief',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.getPlanningBrief.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      return reply.header('cache-control', 'no-store').send(view(outcome.value));
    },
  );
  server.put<{ Params: IdParams }>(
    '/api/projects/:id/planning-brief',
    { bodyLimit: BODY_LIMIT_BYTES, config: { access: 'user' } },
    async (request, reply) => {
      const answers = parseBriefAnswers(request.body);
      if (answers === undefined) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.savePlanningBrief.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        answers,
      });
      if (outcome.ok) return reply.header('cache-control', 'no-store').send(view(outcome.value));
      const { error } = outcome;
      if (error.code === ERROR_CODES.notFound) throw new RosettaError(ERROR_CODES.notFound);
      throw new FieldProblemsError(error.code, error.problems);
    },
  );
}
