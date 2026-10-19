import fastifyCookie from '@fastify/cookie';
import fastifyCsrfProtection from '@fastify/csrf-protection';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { DatabaseHealth } from '../../application/ports/database-health.js';
import type { Logger, LogRecord } from '../../application/ports/logger.js';
import type { ChangePassword } from '../../application/use-cases/change-password.js';
import type { RecordRefusedRequest } from '../../application/use-cases/record-refused-request.js';
import type { ResolveSession } from '../../application/use-cases/resolve-session.js';
import type { SignIn } from '../../application/use-cases/sign-in.js';
import type { SignOut } from '../../application/use-cases/sign-out.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  clientErrorHandler,
  connectHandler,
  expectationHandler,
  frameworkErrorHandler,
} from './early-errors.js';
import { recordCsrfRefusal, registerAccessHooks } from './access-hooks.js';
import { registerAccountRoutes } from './account-routes.js';
import { registerAdminRoutes, type AdminServices } from './admin-routes.js';
import { registerErrorCatalogueRoutes } from './error-catalogue-routes.js';
import { registerCapRoutes, type CapServices } from './cap-routes.js';
import { registerCostRoutes } from './cost-routes.js';
import { registerDefaultRoleRoutes, type DefaultRoleServices } from './default-role-routes.js';
import { registerHistoryRoutes, type HistoryServices } from './history-routes.js';
import { registerHttpsRedirect } from './https-redirect.js';
import { registerKeyRoutes, type KeyServices } from './key-routes.js';
import { registerProviderTestRoutes, type ProviderTestServices } from './provider-test-routes.js';
import { toErrorReply } from './error-mapper.js';
import { recordRateLimited } from './rate-limit-log.js';
import { registerProjectRoutes, type ProjectServices } from './project-routes.js';
import { registerRunRoutes, type RunServices } from './run-routes.js';
import { registerLandingRoute } from './landing-routes.js';
import { registerPublicRoutes } from './public-routes.js';
import { robotsTag, securityHeaderOptions } from './security-headers.js';
import { CSRF_COOKIE, CSRF_HEADER, secureCookie } from './session-cookies.js';
import { isShellRequest } from './route-access.js';
import { registerSessionRoutes } from './session-routes.js';

// ADR-017: the Fastify server. Plugins and hooks are registered here; routes call use cases only.

/**
 * RF-1102, RF-1103, RF-1104, RF-1106, RF-407, RF-1109: the use cases behind the account and
 * administration routes.
 */
export interface AccountServices
  extends AdminServices, KeyServices, CapServices, DefaultRoleServices, ProviderTestServices {
  readonly changePassword: ChangePassword;
}

/** RF-1009, RF-1100, RF-1101: the use cases behind the session hooks and routes. */
export interface AuthServices {
  readonly accounts: AccountServices;
  readonly signIn: SignIn;
  readonly signOut: SignOut;
  readonly resolveSession: ResolveSession;
  readonly refusals: RecordRefusedRequest;
}

export interface ServerOptions {
  /** RF-009: request and error entries; the logger masks every value. */
  readonly logger: Logger;
  readonly databaseHealth: DatabaseHealth;
  readonly auth: AuthServices;
  /** RF-010, RF-002, RF-1105: the use cases behind the projects API. */
  readonly projects: ProjectServices;
  /** RF-1006, RF-1108, RF-1105: the use cases behind the run events and stop routes. */
  readonly runs: RunServices;
  /** RF-1008, RF-1012: the use cases behind the history page, the deletions and the snapshot list. */
  readonly history: HistoryServices;
  /** The Rosetta version reported by /healthz. */
  readonly version: string;
  /** `ROSETTA_PUBLIC_URL`; https turns HSTS on (RF-1013). */
  readonly publicUrl: string;
  /** `ROSETTA_TRUST_PROXY`: proxy hops trusted for the client address; 0 trusts none. */
  readonly trustProxy: number;
  /** `ROSETTA_CONTACT_EMAIL`: the address behind the landing page's Request access link (RF-1201). */
  readonly contactEmail?: string | undefined;
  /** `ROSETTA_UPLOAD_MAX_MB`, told to the page by `GET /api/session` (RF-134); left out when not given. */
  readonly uploadMaxMb?: number;
  /** The folder of the built front end; no static files are served without it. */
  readonly staticRoot?: string;
  /**
   * Called for every route the server registers, with its method(s) and whole url. Tests use it to
   * keep the access matrix complete (RF-1105); it must be set here because a hook only sees the
   * routes registered after it.
   */
  readonly onRoute?: (route: { method: string | readonly string[]; url: string }) => void;
}

/** The largest request body accepted (Fastify's default, stated so it is a decision). */
const bodyLimitBytes = 1_048_576;

/** Writes the entries; a log that cannot be written never stops the response. */
async function writeLog(logger: Logger, records: readonly LogRecord[]): Promise<void> {
  // The standard-output logger has already written each entry when the file logger fails, and
  // the response must still go out, so a failed write is not rethrown here.
  await Promise.allSettled(records.map((record) => logger.log(record)));
}

function requestData(request: FastifyRequest): { requestId: string; method: string; url: string } {
  return { requestId: request.id, method: request.method, url: request.url };
}

// RF-009: one `http` entry per response; the URL is masked by the logger like every value.
function logResponse(logger: Logger, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { statusCode } = reply;
  return writeLog(logger, [
    {
      level: 'info',
      logger: 'http',
      message: `${request.method} ${request.url} ${String(statusCode)}`,
      data: { ...requestData(request), statusCode, durationMs: Math.round(reply.elapsedTime) },
    },
  ]);
}

// RF-007: an unexpected error is logged at `error` without its stack; the stack goes only to the
// `debug` log.
function logUnexpected(logger: Logger, request: FastifyRequest, error: unknown): Promise<void> {
  const failure = error instanceof Error ? error : new Error(String(error));
  const data = { ...requestData(request), error: failure.name };
  return writeLog(logger, [
    {
      level: 'error',
      logger: 'http',
      message: `Unexpected error: ${failure.message}`,
      code: ERROR_CODES.unexpected,
      data,
    },
    {
      level: 'debug',
      logger: 'http',
      message: 'Stack of the unexpected error.',
      data: { ...data, stack: failure.stack ?? '' },
    },
  ]);
}

function registerHooks(server: FastifyInstance, options: ServerOptions): void {
  const { logger } = options;
  server.addHook('onRequest', (_request, reply, done) => {
    reply.header('X-Robots-Tag', robotsTag);
    done();
  });
  // RF-1304: before the access hooks, so a plain-HTTP request never reaches sign-in, CSRF or a route.
  registerHttpsRedirect(server, options);
  server.addHook('onResponse', (request, reply) => logResponse(logger, request, reply));
}

// RF-1009, RF-1100: cookies, the CSRF token in its cookie mode (the secret lives only in the
// `__Host-rosetta_csrf` cookie, never in the database) and the per-route rate limit; reaching the
// limit is a refused request: an audit row and a security event (RF-009, RF-1109).
function registerSessionPlugins(server: FastifyInstance, refusals: RecordRefusedRequest): void {
  void server.register(fastifyCookie);
  void server.register(fastifyCsrfProtection, {
    sessionPlugin: '@fastify/cookie',
    cookieKey: CSRF_COOKIE,
    cookieOpts: secureCookie,
    getToken: (request) => {
      const token = request.headers[CSRF_HEADER];
      return typeof token === 'string' ? token : undefined;
    },
  });
  void server.register(fastifyRateLimit, {
    global: false,
    onExceeded: (request) => {
      void recordRateLimited(refusals, request);
    },
  });
  // RF-1109, DEC-141: the counts of refusals past the per-address limit are written before the
  // database pool closes (the pool ends after the server, shutdown.ts).
  server.addHook('onClose', () => refusals.flushAll());
}

// RF-007: every failure answers { code, message, nextStep } with the status of its cause. With a
// front end mounted, a page request no file answers gets index.html (RF-1009, P1-13): the access
// hooks have already redirected a visitor without a session, except for /sign-in.
function registerErrorHandlers(server: FastifyInstance, options: ServerOptions): void {
  const { logger, auth } = options;
  server.setErrorHandler(async (error, request, reply) => {
    const errorReply = toErrorReply(error);
    if (errorReply.unexpected) await logUnexpected(logger, request, error);
    if (errorReply.body.code === ERROR_CODES.csrfTokenInvalid) {
      await recordCsrfRefusal(auth.refusals, request);
    }
    return reply
      .header('cache-control', 'no-store')
      .status(errorReply.status)
      .send(errorReply.body);
  });
  const hasShell = options.staticRoot !== undefined;
  server.setNotFoundHandler((request, reply) => {
    if (hasShell && isShellRequest(request)) return reply.sendFile('index.html');
    const errorReply = toErrorReply(new RosettaError(ERROR_CODES.notFound));
    return reply
      .header('cache-control', 'no-store')
      .status(errorReply.status)
      .send(errorReply.body);
  });
}

// RF-1009: the access hooks get the public URL, the auth use cases and the logger.
function registerAccess(server: FastifyInstance, options: ServerOptions): void {
  const { publicUrl, logger, auth } = options;
  registerAccessHooks(server, { publicUrl, logger, ...auth });
}

/**
 * RF-1013, RF-1201, RF-1303, RF-007, RF-1009, RF-1100, RF-1101: the server with its plugins, hooks,
 * public routes and the session API.
 */
export function buildServer(options: ServerOptions): FastifyInstance {
  const server = Fastify({
    logger: false,
    bodyLimit: bodyLimitBytes,
    // RF-1013: an HTTP/1.1 request without a Host header reaches the hooks and the routes instead
    // of the bare 400 Node core would send itself.
    http: { requireHostHeader: false },
    // RF-007: while the server drains, a request on a still-busy keep-alive connection is served
    // by the normal chain (with `Connection: close`) instead of Fastify's bare 503, which carries
    // no RST code; RF-007 lists no 503 and in-flight work completes on SIGTERM.
    return503OnClosing: false,
    // Trust the `trustProxy` nearest hops, as a number does in Fastify (its types omit numbers).
    // With a trusted proxy, `request.host` also follows X-Forwarded-Host; the Origin check does not (P1-09).
    trustProxy: (_address, hop) => hop < options.trustProxy,
    frameworkErrors: frameworkErrorHandler(options.logger, options.publicUrl),
    clientErrorHandler: clientErrorHandler(options.logger, options.publicUrl),
  });
  if (options.onRoute !== undefined) server.addHook('onRoute', options.onRoute);
  // Node core answers these itself unless a listener does: a bare 417, or a dropped connection.
  server.server.on('checkExpectation', expectationHandler(options.logger, options.publicUrl));
  server.server.on('connect', connectHandler(options.logger, options.publicUrl));
  void server.register(fastifyHelmet, securityHeaderOptions(options.publicUrl));
  registerHooks(server, options);
  registerSessionPlugins(server, options.auth.refusals);
  registerAccess(server, options);
  registerErrorHandlers(server, options);
  registerPublicRoutes(server, options);
  registerLandingRoute(server, { contactEmail: options.contactEmail });
  // Registered as a plugin, so the rate-limit plugin (loaded first) sees these routes.
  void server.register((instance, _options, done) => {
    registerSessionRoutes(instance, { ...options.auth, uploadMaxMb: options.uploadMaxMb });
    registerAccountRoutes(instance, options.auth.accounts, options.auth.refusals);
    registerKeyRoutes(instance, options.auth.accounts);
    registerProviderTestRoutes(instance, options.auth.accounts, options.auth.refusals);
    registerAdminRoutes(instance, options.auth.accounts);
    registerCapRoutes(instance, options.auth.accounts);
    registerDefaultRoleRoutes(instance, options.auth.accounts);
    registerProjectRoutes(instance, options.projects);
    registerRunRoutes(instance, options.runs, options.logger);
    registerCostRoutes(instance, options.projects);
    registerErrorCatalogueRoutes(instance);
    registerHistoryRoutes(instance, options.history);
    done();
  });
  if (options.staticRoot !== undefined) {
    // The index is the shell the not-found handler sends; `/` is the landing page route (RF-1200).
    void server.register(fastifyStatic, { root: options.staticRoot, index: false });
  }
  return server;
}
