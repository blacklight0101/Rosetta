import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SuggestPlanOptions } from '../../application/use-cases/suggest-plan-options.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { PlanOptions } from '../../domain/planning/plan-options.js';
import { signedInOf } from './request-actor.js';

// RF-608, RF-609, RF-143, RF-1105: the options of Plan setup. POST /api/projects/:id/plan-options
// asks the planner, through the guards, for the two best-fitting architecture styles (trade-offs,
// evidence card ids, one recommended) and two options for each stack layer, from the project's
// newest finished understand run and scan. The body is `{ cloudConsent?: boolean }`: the person's
// consent to send the cards and the scan summary to a cloud provider. It needs a session, CSRF and
// Origin; another user's project answers 404; a project with no finished understand run or no
// supported claim 409 (RST-1802), one without a finished scan 409 (RST-1203). The call costs money,
// so it is limited per address. Nothing is stored: the choice is saved in the planning brief.

export interface PlanOptionsServices {
  readonly suggestPlanOptions: Pick<SuggestPlanOptions, 'execute'>;
}

const BODY_LIMIT_BYTES = 1024;
const ADDRESS_RATE = { max: 12, timeWindow: 60_000 } as const;

const body = z.strictObject({
  cloudConsent: z.boolean().optional(),
  /** RF-614: recommend from this understand run (its id); the newest completed one when absent. */
  sourceRunId: z.string().min(1).max(64).optional(),
});

function view(options: PlanOptions): Record<string, unknown> {
  const { architecture, stack } = options;
  return {
    architecture: {
      recommended: architecture.recommended,
      options: architecture.options.map((option) => ({ ...option })),
    },
    stack: stack.map(({ layer, options: choices }) => ({ layer, options: [...choices] })),
  };
}

// RF-608, RF-609
export function registerPlanOptionsRoutes(
  server: FastifyInstance,
  services: PlanOptionsServices,
): void {
  server.post<{ Params: { id: string } }>(
    '/api/projects/:id/plan-options',
    { bodyLimit: BODY_LIMIT_BYTES, config: { access: 'user', rateLimit: ADDRESS_RATE } },
    async (request, reply) => {
      const parsed = body.safeParse(request.body ?? {});
      if (!parsed.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.suggestPlanOptions.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        cloudConsent: parsed.data.cloudConsent === true,
        ...(parsed.data.sourceRunId === undefined ? {} : { sourceRunId: parsed.data.sourceRunId }),
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.header('cache-control', 'no-store').status(200).send(view(outcome.value));
    },
  );
}
