import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseDefaultRoles } from '../../application/projects/default-roles.js';
import type { GetDefaultRoles } from '../../application/use-cases/get-default-roles.js';
import type { SetDefaultRoles } from '../../application/use-cases/set-default-roles.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { FieldProblemsError } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// DEC-106, P1-42: the default models per role for new projects.
// - GET /api/admin/default-roles answers `{ roles }`, `{}` until the administrator sets them.
// - PUT /api/admin/default-roles with `{ roles }` replaces them (administrators only); a role
//   left out keeps the template's model, and projects that exist are not touched.

export interface DefaultRoleServices {
  readonly getDefaultRoles: GetDefaultRoles;
  readonly setDefaultRoles: SetDefaultRoles;
}

const BODY_LIMIT_BYTES = 4096;
const body = z.strictObject({ roles: z.record(z.string(), z.unknown()) });

// DEC-106
export function registerDefaultRoleRoutes(
  server: FastifyInstance,
  services: DefaultRoleServices,
): void {
  server.get('/api/admin/default-roles', { config: { access: 'admin' } }, async (_request, reply) =>
    reply.status(200).send({ roles: await services.getDefaultRoles.execute() }),
  );

  server.put(
    '/api/admin/default-roles',
    { bodyLimit: BODY_LIMIT_BYTES, config: { access: 'admin' } },
    async (request, reply) => {
      const parsed = body.safeParse(request.body);
      if (!parsed.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const checked = parseDefaultRoles(parsed.data.roles);
      if (!checked.ok) throw new FieldProblemsError(ERROR_CODES.settingsInvalid, checked.error);
      const roles = await services.setDefaultRoles.execute({
        actor: signedInOf(request).actor,
        roles: checked.value,
        ip: request.ip,
      });
      return reply.status(200).send({ roles });
    },
  );
}
