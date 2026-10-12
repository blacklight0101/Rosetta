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
  }
}

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
