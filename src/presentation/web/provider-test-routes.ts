import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RoleTestResult, TestProviders } from '../../application/use-cases/test-providers.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { describeError } from '../../domain/errors/descriptions.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-407, RF-1009: the Test button of the settings page. POST /api/account/providers/test checks
// each role of a new project with one tiny call through the guards and answers every role as
// reachable or with its error code, plain message and next step, and the cost of its call in
// micro-dollars (a decimal string). The calls are metered in the signed-in user's ledger, so the
// route is limited to a few presses a minute per user, and per address. It takes no body and answers no key.

export interface ProviderTestServices {
  readonly testProviders: TestProviders;
}

/** Each press costs money: a few a minute per user, and a looser limit per address. */
const USER_RATE = { max: 6, timeWindow: 60_000 } as const;
const ADDRESS_RATE = { max: 30, timeWindow: 60_000 } as const;

function roleView(result: RoleTestResult): Record<string, string> {
  const { role, provider, model, status, costMicros, code } = result;
  const base = {
    role,
    provider,
    model,
    status,
    costMicros: costMicros.toString(),
    currency: 'USD',
  };
  return code === undefined ? base : { ...base, code, ...describeError(code) };
}

// RF-407
export function registerProviderTestRoutes(
  server: FastifyInstance,
  services: ProviderTestServices,
): void {
  // The session is resolved by the access hook before the handlers run, so the per-user limit is
  // a pre-handler that keys on the signed-in user (the per-address one runs before it).
  const perUser = server.createRateLimit({
    ...USER_RATE,
    keyGenerator: (request) => `provider-test:${request.signedIn?.actor.userId ?? request.ip}`,
  });
  const limitUser = async (request: FastifyRequest): Promise<void> => {
    const verdict = await perUser(request);
    if (!verdict.isAllowed && verdict.isExceeded) throw new RosettaError(ERROR_CODES.rateLimited);
  };
  server.post(
    '/api/account/providers/test',
    { config: { access: 'user', rateLimit: ADDRESS_RATE }, preHandler: limitUser },
    async (request, reply) => {
      const outcome = await services.testProviders.execute({ actor: signedInOf(request).actor });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(200).send({ roles: outcome.value.map(roleView) });
    },
  );
}
