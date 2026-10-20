import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RecordRefusedRequest } from '../../application/use-cases/record-refused-request.js';
import type { SignIn } from '../../application/use-cases/sign-in.js';
import type { SignOut } from '../../application/use-cases/sign-out.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  MAX_PASSWORD_LENGTH,
  PASSWORD_BODY_LIMIT_BYTES,
  PASSWORD_RATE,
} from './password-limits.js';
import { recordRateLimited } from './rate-limit-log.js';
import { signedInOf } from './request-actor.js';
import { CSRF_COOKIE, secureCookie, SESSION_COOKIE } from './session-cookies.js';

// RF-1100, RF-1101, RF-1009: the session API.
// - POST /api/session signs in (public; Origin-checked, 10 attempts per minute per IP). It sets
//   the new `__Host-rosetta_session` cookie and answers the user and a CSRF token under a new
//   secret, so a token issued before the sign-in is refused afterwards.
// - GET /api/session answers the signed-in user and a CSRF token.
// - DELETE /api/session signs out and clears the session and CSRF secret cookies (204).
// No body ever holds the session id, a hash or the CSRF secret (the token is derived from it).
// The P1-08 hasher has no length limit and queues hashes, so the body is capped at 4 KiB, the
// password at 1,024 characters, and at most eight sign-ins are verified at a time; beyond that the
// request is answered 429 before any hashing (the rate limit alone does not bound many addresses),
// and the refusal is audited and logged like a rate-limit hit (RF-1109).

export interface SessionRouteOptions {
  readonly signIn: SignIn;
  readonly signOut: SignOut;
  readonly refusals: RecordRefusedRequest;
  /** `ROSETTA_UPLOAD_MAX_MB`; told to the page so it can refuse a big file before sending it (RF-134). */
  readonly uploadMaxMb?: number | undefined;
  /** `ROSETTA_WORKBOOK_MAX_FILES`; told to the page beside the size limit (RF-158). */
  readonly workbookMaxFiles?: number | undefined;
}

const MAX_USER_NAME_LENGTH = 200;
const MAX_PENDING_SIGN_INS = 8;

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

/**
 * RF-1009: a token under a new CSRF secret; a secret the browser brought is never reused. Sign-in
 * and a password change both use it.
 */
export function freshCsrfToken(request: FastifyRequest, reply: FastifyReply): string {
  request.cookies[CSRF_COOKIE] = undefined;
  return reply.generateCsrf();
}

function registerSignIn(server: FastifyInstance, options: SessionRouteOptions): void {
  const { signIn, refusals } = options;
  let pending = 0;
  server.post(
    '/api/session',
    {
      bodyLimit: PASSWORD_BODY_LIMIT_BYTES,
      config: { access: 'public', rateLimit: PASSWORD_RATE },
    },
    async (request, reply) => {
      const body = parseSignIn(request.body);
      if (pending >= MAX_PENDING_SIGN_INS) {
        await recordRateLimited(refusals, request);
        throw new RosettaError(ERROR_CODES.rateLimited);
      }
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
      const csrfToken = freshCsrfToken(request, reply);
      return reply.status(200).send({ user: outcome.value.user, csrfToken });
    },
  );
}

// RF-1100, RF-1101
export function registerSessionRoutes(server: FastifyInstance, options: SessionRouteOptions): void {
  registerSignIn(server, options);

  server.get(
    '/api/session',
    { config: { access: 'user', duringPasswordChange: true } },
    (request, reply) =>
      reply.status(200).send({
        user: signedInOf(request).user,
        csrfToken: reply.generateCsrf(),
        ...(options.uploadMaxMb === undefined ? {} : { uploadMaxMb: options.uploadMaxMb }),
        ...(options.workbookMaxFiles === undefined
          ? {}
          : { workbookMaxFiles: options.workbookMaxFiles }),
      }),
  );

  server.delete(
    '/api/session',
    { config: { access: 'user', duringPasswordChange: true } },
    async (request, reply) => {
      const { actor, sessionId } = signedInOf(request);
      await options.signOut.execute({ actor, sessionId, ip: request.ip });
      void reply.clearCookie(SESSION_COOKIE, secureCookie);
      void reply.clearCookie(CSRF_COOKIE, secureCookie);
      return reply.status(204).send();
    },
  );
}
