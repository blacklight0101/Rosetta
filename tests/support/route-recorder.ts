import type { FastifyInstance } from 'fastify';

// RF-1105: every route a server registers, as "METHOD url" with the whole url, wildcards included.
// Fastify's printed route listing drops the path before a wildcard, so the access matrix compares
// this record, which comes from the `onRoute` hook, with its rows.

export interface RouteRecorder {
  /** Pass to `buildServer` as `onRoute`. */
  readonly onRoute: (route: { method: string | readonly string[]; url: string }) => void;
  /** "METHOD url" of every route seen so far, sorted, each once. */
  rows(): readonly string[];
}

export function recordRoutes(): RouteRecorder {
  const rows = new Set<string>();
  return {
    onRoute: (route) => {
      for (const method of [route.method].flat()) rows.add(`${method} ${route.url}`);
    },
    rows: () => [...rows].sort(),
  };
}

/** Records the routes of a bare server; call before registering any route. */
export function recordRoutesOf(server: FastifyInstance): RouteRecorder {
  const recorder = recordRoutes();
  server.addHook('onRoute', recorder.onRoute);
  return recorder;
}
