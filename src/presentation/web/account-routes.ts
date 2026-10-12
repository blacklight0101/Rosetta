import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ChangePassword,
  ChangePasswordProblem,
} from '../../application/use-cases/change-password.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { FieldProblemsError } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';
import { secureCookie, SESSION_COOKIE } from './session-cookies.js';
import { MAX_PASSWORD_LENGTH, PASSWORD_BODY_LIMIT_BYTES, PASSWORD_RATE } from './session-routes.js';

// RF-1103, RF-1102: the signed-in user's own account.
// - POST /api/account/password changes the password with the current one. It is the one route
//   besides the session API that a user in MustChangePassword reaches. The answer sets a new
//   session cookie (the other sessions are ended) and carries the user and a CSRF token, like
//   sign-in. A refused rule names its field so the form can show it there.
// Like sign-in, the body is capped at 4 KiB, each password at 1,024 characters, attempts at 10 a
// minute per address, and at most eight changes are verified at a time (429 beyond), which bounds
// the scrypt queue (each change verifies one hash and makes one).

export interface AccountRouteOptions {
  readonly changePassword: ChangePassword;
}

const MAX_PENDING_CHANGES = 8;

const changeBody = z.strictObject({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

function refusal(code: ChangePasswordProblem): RosettaError {
  if (code === ERROR_CODES.notFound || code === ERROR_CODES.accountStateInvalid) {
    return new RosettaError(code);
  }
  const field = code === ERROR_CODES.currentPasswordIncorrect ? 'currentPassword' : 'newPassword';
  return new FieldProblemsError(code, [{ field, code }]);
}

// RF-1103
export function registerAccountRoutes(server: FastifyInstance, options: AccountRouteOptions): void {
  let pending = 0;
  server.post(
    '/api/account/password',
    {
      bodyLimit: PASSWORD_BODY_LIMIT_BYTES,
      config: { access: 'user', duringPasswordChange: true, rateLimit: PASSWORD_RATE },
    },
    async (request, reply) => {
      const body = changeBody.safeParse(request.body);
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      if (pending >= MAX_PENDING_CHANGES) throw new RosettaError(ERROR_CODES.rateLimited);
      pending += 1;
      const outcome = await options.changePassword
        .execute({
          actor: signedInOf(request).actor,
          ...body.data,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
        })
        .finally(() => {
          pending -= 1;
        });
      if (!outcome.ok) throw refusal(outcome.error);
      void reply.setCookie(SESSION_COOKIE, outcome.value.sessionId, secureCookie);
      return reply.status(200).send({ user: outcome.value.user, csrfToken: reply.generateCsrf() });
    },
  );
}
