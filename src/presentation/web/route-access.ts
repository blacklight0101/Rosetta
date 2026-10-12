import type { FastifyRequest } from 'fastify';

// RF-1009, RNF-014, CLAUDE.md: every route needs a session unless it is public (landing page,
// sign-in, /healthz, static assets, robots.txt); administrator routes also need the `admin` role
// (RF-1102). A route states its access in `config.access`; a request no route claims (the static
// files of the front end and the not-found handler) is public only for the landing page, the
// sign-in page and files under /assets/, and otherwise needs a session (secure by default).

export type RouteAccess = 'public' | 'user' | 'admin';

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: RouteAccess;
    /** RF-1102: true for the routes a user whose password must be changed may still use. */
    duringPasswordChange?: boolean;
    /**
     * RF-1009, RF-1303: true for a public route that reads `request.signedIn` (the landing page).
     * Every other public request skips the session lookup, so a database outage cannot fail it.
     */
    readsSession?: boolean;
  }
}

/** RF-1102: the change-password page; the app shell serves it (P1-14 draws the form). */
export const CHANGE_PASSWORD_PAGE = '/account/password';

const PUBLIC_PAGES: ReadonlySet<string> = new Set(['/', '/sign-in']);
/** Plain file names under /assets/; no segment starts with a dot, so no `..` and no hidden file. */
const PUBLIC_ASSET = /^\/assets(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$/;
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The path of the request without its query string. */
// RF-1009
export function requestPath(request: FastifyRequest): string {
  const [path = ''] = request.url.split('?', 1);
  return path;
}

// RF-1009
export function accessOf(request: FastifyRequest): RouteAccess {
  const configured = request.routeOptions.config.access;
  if (configured !== undefined) return configured;
  const path = requestPath(request);
  return PUBLIC_PAGES.has(path) || PUBLIC_ASSET.test(path) ? 'public' : 'user';
}

/**
 * RF-1102: what a signed-in user in MustChangePassword may still reach: public requests, routes
 * marked `duringPasswordChange` (the session API and the change-password route) and the
 * change-password page itself.
 */
// RF-1102
export function allowedDuringPasswordChange(request: FastifyRequest): boolean {
  if (accessOf(request) === 'public') return true;
  if (request.routeOptions.config.duringPasswordChange === true) return true;
  return isPageRequest(request) && requestPath(request) === CHANGE_PASSWORD_PAGE;
}

/** RF-1009: false for a public request whose route does not read the session (RF-1303). */
// RF-1009
export function needsSession(request: FastifyRequest): boolean {
  return accessOf(request) !== 'public' || request.routeOptions.config.readsSession === true;
}

/** POST, PUT, PATCH, DELETE and any other method that is not safe (RF-1009). */
// RF-1009
export function isStateChanging(request: FastifyRequest): boolean {
  return !SAFE_METHODS.has(request.method);
}

/** A page request: a GET or HEAD outside /api/; it is redirected to sign-in instead of a 401. */
// RF-1009
export function isPageRequest(request: FastifyRequest): boolean {
  const path = requestPath(request);
  const api = path === '/api' || path.startsWith('/api/');
  return !api && (request.method === 'GET' || request.method === 'HEAD');
}

/**
 * A request for a page of the front end that has no file of its own: a page request outside
 * /assets/. It is answered with index.html so the client router draws the page (P1-13).
 */
// RF-1009
export function isShellRequest(request: FastifyRequest): boolean {
  const path = requestPath(request);
  const asset = path === '/assets' || path.startsWith('/assets/');
  return isPageRequest(request) && !asset;
}
