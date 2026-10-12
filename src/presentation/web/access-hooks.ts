import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
import { accessOf, isPageRequest, isStateChanging, requestPath } from './route-access.js';
import { SESSION_COOKIE } from './session-cookies.js';

// RF-1009, RF-1101, RF-1102, RF-1109, DEC-112: the request hooks, in this order.
// 1. Origin: a state-changing request whose `Origin` is not the public URL's origin (or is
//    missing) is refused with 403 RST-2007; this also protects sign-in, which has no session yet.
// 2. Session: the `__Host-rosetta_session` cookie becomes `request.signedIn` (or null).
// 3. Access: without a session a page redirects to /sign-in and anything else answers 401; a
//    `user` on an administrator route answers 403.
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
  return undefined;
}

// RF-1009
export function registerAccessHooks(server: FastifyInstance, options: AccessHookOptions): void {
  const { resolveSession, refusals } = options;
  const origin = new URL(options.publicUrl).origin;
  server.decorateRequest('signedIn', null);

  server.addHook('onRequest', async (request) => {
    if (!isStateChanging(request) || request.headers.origin === origin) return;
    await refuse(refusals, request, 'origin');
    throw new RosettaError(ERROR_CODES.originRefused);
  });

  server.addHook('onRequest', async (request) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId === undefined || sessionId === '') return;
    request.signedIn = (await resolveSession.execute(sessionId)) ?? null;
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
