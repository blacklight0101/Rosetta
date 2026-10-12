import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SignIn } from '../../application/use-cases/sign-in.js';
import type { SignOut } from '../../application/use-cases/sign-out.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';
import { secureCookie, SESSION_COOKIE } from './session-cookies.js';

// RF-1100, RF-1101, RF-1009: the session API.
// - POST /api/session signs in (public; Origin-checked, 10 attempts per minute per IP). It sets
//   the new `__Host-rosetta_session` cookie and answers the user and a CSRF token.
// - GET /api/session answers the signed-in user and a CSRF token.
// - DELETE /api/session signs out and clears the cookie (204).
// No body ever holds the session id, a hash or the CSRF secret (the token is derived from it).
// The P1-08 hasher has no length limit and queues hashes, so the body is capped at 4 KiB, the
// password at 1,024 characters, and at most eight sign-ins are verified at a time; beyond that the
// request is answered 429 before any hashing (the rate limit alone does not bound many addresses).

export interface SessionRouteOptions {
  readonly signIn: SignIn;
  readonly signOut: SignOut;
}

/** The body and password caps of every route that takes a password (P1-09, P1-10). */
export const PASSWORD_BODY_LIMIT_BYTES = 4096;
export const MAX_PASSWORD_LENGTH = 1024;
const SIGN_IN_BODY_LIMIT_BYTES = PASSWORD_BODY_LIMIT_BYTES;
const MAX_USER_NAME_LENGTH = 200;
const MAX_PENDING_SIGN_INS = 8;
/** Attempts per minute per address on the routes that verify a password (RF-1100). */
export const PASSWORD_RATE = { max: 10, timeWindow: 60_000 } as const;
const SIGN_IN_RATE = PASSWORD_RATE;

const signInBody = z
  .object({
    userName: z.string().min(1).max(MAX_USER_NAME_LENGTH),
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  })
  .strict();

function parseSignIn(body: unknown): z.output<typeof signInBody> {
  const parsed = signInBody.safeParse(body);
  if (!parsed.success) throw new RosettaError(ERROR_CODES.requestInvalid);
  return parsed.data;
}

function registerSignIn(server: FastifyInstance, signIn: SignIn): void {
  let pending = 0;
  server.post(
    '/api/session',
    {
      bodyLimit: SIGN_IN_BODY_LIMIT_BYTES,
      config: { access: 'public', rateLimit: SIGN_IN_RATE },
    },
    async (request, reply) => {
      const body = parseSignIn(request.body);
      if (pending >= MAX_PENDING_SIGN_INS) throw new RosettaError(ERROR_CODES.rateLimited);
      pending += 1;
      const outcome = await signIn
        .execute({
          ...body,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
          previousSessionId: request.cookies[SESSION_COOKIE],
        })
        .finally(() => {
          pending -= 1;
        });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      void reply.setCookie(SESSION_COOKIE, outcome.value.sessionId, secureCookie);
      return reply.status(200).send({ user: outcome.value.user, csrfToken: reply.generateCsrf() });
    },
  );
}

// RF-1100, RF-1101
export function registerSessionRoutes(server: FastifyInstance, options: SessionRouteOptions): void {
  registerSignIn(server, options.signIn);

  server.get(
    '/api/session',
    { config: { access: 'user', duringPasswordChange: true } },
    (request, reply) =>
      reply.status(200).send({ user: signedInOf(request).user, csrfToken: reply.generateCsrf() }),
  );

  server.delete(
    '/api/session',
    { config: { access: 'user', duringPasswordChange: true } },
    async (request, reply) => {
      const { actor, sessionId } = signedInOf(request);
      await options.signOut.execute({ actor, sessionId, ip: request.ip });
      void reply.clearCookie(SESSION_COOKIE, secureCookie);
      return reply.status(204).send();
    },
  );
}
