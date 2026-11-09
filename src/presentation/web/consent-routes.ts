import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CONSENT_STARTS,
  type ReadProjectConsent,
  type WithdrawProjectConsent,
} from '../../application/use-cases/project-consent-reads.js';
import { CONSENT_LIFETIME_MS, type ProjectConsent } from '../../domain/consent/project-consent.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-143, RF-1105, DEC-209 (P8-81): the consent a page shows as one line instead of the boxes.
// GET /api/projects/:id/consent?for=understand|plan answers `{ consent }`: the newest consent of the
// project that holds for the roles of that start (`understand`: an understand run and a Deepen;
// `plan`: the planner), with the time it was given, the time it ends (30 days later), its providers
// and its kinds, or `null`. DELETE /api/projects/:id/consent withdraws every consent of the project
// and answers `{ withdrawn }`, how many; the rows are kept (RF-142). Both need a session (the DELETE
// also CSRF and Origin); another user's project answers 404 and is not read or changed; a missing
// or unknown `for` answers 400.

export interface ConsentServices {
  readonly readProjectConsent: Pick<ReadProjectConsent, 'execute'>;
  readonly withdrawProjectConsent: Pick<WithdrawProjectConsent, 'execute'>;
}

const query = z.strictObject({ for: z.enum(CONSENT_STARTS) });

const instant = (at: number): string => new Date(at).toISOString();

function consentView(consent: ProjectConsent): Record<string, unknown> {
  return {
    id: consent.id,
    givenAt: instant(consent.givenAt),
    endsAt: instant(consent.givenAt + CONSENT_LIFETIME_MS),
    providers: [...consent.providers],
    kinds: [...consent.kinds],
  };
}

// RF-143
export function registerConsentRoutes(server: FastifyInstance, services: ConsentServices): void {
  server.get<{ Params: { id: string }; Querystring: unknown }>(
    '/api/projects/:id/consent',
    { config: { access: 'user' } },
    async (request, reply) => {
      const parsed = query.safeParse(request.query);
      if (!parsed.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.readProjectConsent.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        start: parsed.data.for,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const consent = outcome.value === undefined ? null : consentView(outcome.value);
      return reply.header('cache-control', 'no-store').status(200).send({ consent });
    },
  );
  server.delete<{ Params: { id: string } }>(
    '/api/projects/:id/consent',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.withdrawProjectConsent.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(200).send({ withdrawn: outcome.value });
    },
  );
}
