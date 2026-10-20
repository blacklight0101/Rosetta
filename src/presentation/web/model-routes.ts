import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ListModels } from '../../application/use-cases/list-models.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-405, DEC-156, ADR-006: GET /api/models/:provider answers `{ provider, models, reason? }`: the
// models a role of that provider can be set to, each `{ model, label, priced }`. `anthropic` and
// `openai` come from the shipped list (`priced` false shows as "no price"); `ollama` comes from the
// models installed on the Ollama server the server is configured with, an empty list and a `reason`
// when it cannot be asked (never an error page); the other providers have no list. It needs a
// session, any role (the project settings page uses it too). It takes no body and no query: the
// Ollama address is never read from the request.

export interface ModelServices {
  readonly listModels: Pick<ListModels, 'execute'>;
}

/** Each Ollama question is one HTTP call to the configured server, so the route is limited. */
const ADDRESS_RATE = { max: 60, timeWindow: 60_000 } as const;

const providerKinds = z.enum(['ollama', 'openai', 'openai-compatible', 'anthropic', 'fake']);

// RF-405
export function registerModelRoutes(server: FastifyInstance, services: ModelServices): void {
  server.get<{ Params: { provider: string } }>(
    '/api/models/:provider',
    { config: { access: 'user', rateLimit: ADDRESS_RATE } },
    async (request, reply) => {
      const provider = providerKinds.safeParse(request.params.provider);
      if (!provider.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const choices = await services.listModels.execute(provider.data);
      return reply.header('cache-control', 'no-store').status(200).send(choices);
    },
  );
}
