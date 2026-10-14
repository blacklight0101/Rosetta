import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from '../../application/ports/logger.js';
import type {
  RecordRefusedRequest,
  RefusalReason,
} from '../../application/use-cases/record-refused-request.js';
import type {
  ResolveSession,
  SignedInSession,
} from '../../application/use-cases/resolve-session.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  accessOf,
  allowedDuringPasswordChange,
  CHANGE_PASSWORD_PAGE,
  isPageRequest,
  isStateChanging,
  needsSession,
  requestPath,
} from './route-access.js';
import { SESSION_COOKIE } from './session-cookies.js';

// RF-1009, RF-1101, RF-1102, RF-1109, DEC-112: the request hooks, in this order.
// 1. Origin: a state-changing request whose `Origin` is not the public URL's origin (or is
//    missing) is refused with 403 RST-2007; this also protects sign-in, which has no session yet.
//    The refusal is audited with the actor of a valid session cookie (P1-160); a cookie that is
//    unknown, expired or of a disabled account, or a lookup that fails, records none.
// 2. Session: the `__Host-rosetta_session` cookie becomes `request.signedIn` (or null). A public
//    route skips the lookup unless it reads the session (`readsSession`, the landing page), so
//    /healthz still answers 503 with a cookie while the database is down (RF-1303); if that
//    lookup fails, the landing page treats the visitor as signed out (RF-1200) and logs it at warn.
// 3. Access: without a session a page redirects to /sign-in and anything else answers 401; a
//    `user` on an administrator route answers 403. A user whose password must be changed
//    (MustChangePassword, RF-1102) reaches only the session API, the change-password route and
//    the change-password page: another page redirects to /account/password and anything else
//    answers 403 RST-2212.
// 4. CSRF: a state-changing request on a non-public route needs the token of
//    @fastify/csrf-protection in the `x-csrf-token` header (403 RST-2008, recorded by the error
//    handler through `recordCsrfRefusal`).
// Every 403 writes an audit row and a security event.

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in session of the request; null when nobody is signed in. */
    signedIn: SignedInSession | null;
  }
}

export interface AccessHookOptions {
  /** `ROSETTA_PUBLIC_URL`, an origin. */
  readonly publicUrl: string;
  readonly resolveSession: ResolveSession;
  readonly refusals: RecordRefusedRequest;
  /** RNF-003: the landing page's failed session lookup is logged here. */
  readonly logger: Logger;
}

const SIGN_IN_PAGE = '/sign-in';

function refuse(
  refusals: RecordRefusedRequest,
  request: FastifyRequest,
  reason: RefusalReason,
): Promise<void> {
  return refusals.execute({
    actor: request.signedIn?.actor ?? null,
    reason,
    method: request.method,
    path: requestPath(request),
    ip: request.ip,
  });
}

/** RF-1009: the error handler calls this for a request refused by the CSRF plugin. */
export function recordCsrfRefusal(
  refusals: RecordRefusedRequest,
  request: FastifyRequest,
): Promise<void> {
  return refuse(refusals, request, 'csrf');
}

async function checkAccess(
  refusals: RecordRefusedRequest,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const access = accessOf(request);
  if (access === 'public') return undefined;
  if (request.signedIn === null) {
    if (isPageRequest(request)) return reply.redirect(SIGN_IN_PAGE, 302);
    throw new RosettaError(ERROR_CODES.notSignedIn);
  }
  if (access === 'admin' && request.signedIn.actor.role !== 'admin') {
    await refuse(refusals, request, 'role');
    throw new RosettaError(ERROR_CODES.notAllowed);
  }
  return checkPasswordChange(refusals, request, reply);
}

// RF-1102
async function checkPasswordChange(
  refusals: RecordRefusedRequest,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  if (request.signedIn?.user.state !== 'MustChangePassword') return undefined;
  if (allowedDuringPasswordChange(request)) return undefined;
  if (isPageRequest(request)) return reply.redirect(CHANGE_PASSWORD_PAGE, 302);
  await refuse(refusals, request, 'password-change');
  throw new RosettaError(ERROR_CODES.passwordChangeRequired);
}

// RNF-003: a log that cannot be written (it rejects or throws) never fails the request.
async function logLookupFailure(logger: Logger, request: FastifyRequest): Promise<void> {
  try {
    await logger.log({
      level: 'warn',
      logger: 'http',
      message: 'The session lookup failed; the page is shown to a visitor.',
      code: ERROR_CODES.databaseQueryFailed,
      data: { path: requestPath(request) },
    });
  } catch {
    // Nothing else can report a failing logger; the visitor page is still shown.
  }
}

/**
 * RF-1009, RF-1200: a public route that reads the session (the landing page) shows its visitor page
 * when the lookup fails, instead of answering 500; any other route lets the failure through. The
 * failure is logged at warn with RST-2404 and the path only (RNF-003), never the error text.
 */
async function lookUp(
  resolveSession: ResolveSession,
  logger: Logger,
  request: FastifyRequest,
  sessionId: string,
): Promise<SignedInSession | null> {
  if (accessOf(request) !== 'public') return (await resolveSession.execute(sessionId)) ?? null;
  try {
    return (await resolveSession.execute(sessionId)) ?? null;
  } catch {
    await logLookupFailure(logger, request);
    return null;
  }
}

/**
 * RF-1109, P1-160: the session of a request refused for its `Origin`, only to name its actor in the
 * audit row. A lookup that fails counts as no session, so the refusal still answers 403.
 */
async function refusedSession(
  resolveSession: ResolveSession,
  request: FastifyRequest,
): Promise<SignedInSession | null> {
  const sessionId = request.cookies[SESSION_COOKIE];
  if (sessionId === undefined) return null;
  try {
    return (await resolveSession.execute(sessionId)) ?? null;
  } catch {
    // The request is refused either way; the audit row then has no actor.
    return null;
  }
}

// RF-1009
export function registerAccessHooks(server: FastifyInstance, options: AccessHookOptions): void {
  const { resolveSession, refusals, logger } = options;
  const origin = new URL(options.publicUrl).origin;
  server.decorateRequest('signedIn', null);

  server.addHook('onRequest', async (request) => {
    if (!isStateChanging(request) || request.headers.origin === origin) return;
    request.signedIn = await refusedSession(resolveSession, request);
    await refuse(refusals, request, 'origin');
    throw new RosettaError(ERROR_CODES.originRefused);
  });

  server.addHook('onRequest', async (request) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId === undefined || sessionId === '' || !needsSession(request)) return;
    request.signedIn = await lookUp(resolveSession, logger, request, sessionId);
  });

  server.addHook('onRequest', (request, reply) => checkAccess(refusals, request, reply));

  server.addHook('onRequest', (request, reply, done) => {
    if (!isStateChanging(request) || accessOf(request) === 'public') {
      done();
      return;
    }
    server.csrfProtection(request, reply, done);
  });
}
