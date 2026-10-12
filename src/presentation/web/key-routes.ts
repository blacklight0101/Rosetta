import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DeleteProviderKey } from '../../application/use-cases/delete-provider-key.js';
import type {
  ListProviderKeys,
  ProviderKeySummary,
} from '../../application/use-cases/list-provider-keys.js';
import type {
  SaveProviderKey,
  SaveProviderKeyProblem,
} from '../../application/use-cases/save-provider-key.js';
import {
  isKeyProvider,
  MAX_BASE_URL_LENGTH,
  MAX_KEY_LENGTH,
  type KeyProvider,
} from '../../domain/accounts/provider-keys.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { FieldProblemsError } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-1104, RF-1105: the signed-in user's provider keys. Not reachable while the password must be
// changed (RF-1102); every route answers only the actor's own keys.
// - GET /api/account/keys lists provider, last four characters and update time.
// - PUT /api/account/keys/:provider saves or replaces the key (and, for `openai-compatible`, its
//   base URL) and answers the same three fields; the key itself never leaves the server again.
// - DELETE /api/account/keys/:provider removes it (204); a key the user does not have is 404.
// A provider that takes no key is 404. The body is capped at 8 KiB; saves are limited to 10 a
// minute per address, as each may resolve a host name.

export interface KeyServices {
  readonly listProviderKeys: ListProviderKeys;
  readonly saveProviderKey: SaveProviderKey;
  readonly deleteProviderKey: DeleteProviderKey;
}

const KEY_BODY_LIMIT_BYTES = 8192;
const KEY_RATE = { max: 10, timeWindow: 60_000 } as const;

/** The JSON length cap is generous; the key rules count characters in the domain. */
const saveBody = z.strictObject({
  key: z.string().max(MAX_KEY_LENGTH * 4),
  baseUrl: z
    .string()
    .max(MAX_BASE_URL_LENGTH * 2)
    .optional(),
});

interface ProviderParams {
  readonly provider: string;
}

function providerOf(params: ProviderParams): KeyProvider {
  if (!isKeyProvider(params.provider)) throw new RosettaError(ERROR_CODES.notFound);
  return params.provider;
}

function refusal(code: SaveProviderKeyProblem): RosettaError {
  if (code === ERROR_CODES.requestInvalid) return new RosettaError(code);
  const field = code === ERROR_CODES.baseUrlRejected ? 'baseUrl' : 'key';
  return new FieldProblemsError(code, [{ field, code }]);
}

function keyView(summary: ProviderKeySummary): Record<string, string> {
  const { provider, last4, updatedAt } = summary;
  return { provider, last4, updatedAt: updatedAt.toISOString() };
}

// RF-1104
export function registerKeyRoutes(server: FastifyInstance, services: KeyServices): void {
  server.get('/api/account/keys', { config: { access: 'user' } }, async (request, reply) => {
    const keys = await services.listProviderKeys.execute({ actor: signedInOf(request).actor });
    return reply.status(200).send({ keys: keys.map(keyView) });
  });

  server.put<{ Params: ProviderParams }>(
    '/api/account/keys/:provider',
    {
      bodyLimit: KEY_BODY_LIMIT_BYTES,
      config: { access: 'user', rateLimit: KEY_RATE },
    },
    async (request, reply) => {
      const provider = providerOf(request.params);
      const body = saveBody.safeParse(request.body);
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.saveProviderKey.execute({
        actor: signedInOf(request).actor,
        provider,
        ...body.data,
        ip: request.ip,
      });
      if (!outcome.ok) throw refusal(outcome.error);
      return reply.status(200).send({ key: keyView(outcome.value) });
    },
  );

  server.delete<{ Params: ProviderParams }>(
    '/api/account/keys/:provider',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.deleteProviderKey.execute({
        actor: signedInOf(request).actor,
        provider: providerOf(request.params),
        ip: request.ip,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.status(204).send();
    },
  );
}
