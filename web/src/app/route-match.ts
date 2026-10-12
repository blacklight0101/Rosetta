import type { RouteDefinition } from './route-types.js';

// P1-12: matches a location against the router table. A path is literal segments and `:name`
// parameters; the query string, the hash and a trailing slash do not take part.

export interface RouteMatch {
  readonly route: RouteDefinition;
  readonly params: Readonly<Record<string, string>>;
}

/** The segments of a location's path: `/a/b/?x=1#y` -> `['a', 'b']`; `/` -> `[]`. */
export function segmentsOf(location: string): readonly string[] {
  const [beforeHash = ''] = location.split('#', 1);
  const [path = ''] = beforeHash.split('?', 1);
  const segments = path.split('/').slice(1);
  return segments.at(-1) === '' ? segments.slice(0, -1) : segments;
}

function decode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

function paramsOf(
  pattern: readonly string[],
  actual: readonly string[],
): Record<string, string> | undefined {
  if (pattern.length !== actual.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, part] of pattern.entries()) {
    const segment = actual[index] ?? '';
    if (part.startsWith(':')) {
      const value = decode(segment);
      if (value === undefined || value === '') return undefined;
      params[part.slice(1)] = value;
    } else if (part !== segment) {
      return undefined;
    }
  }
  return params;
}

// RNF-010
export function matchRoute(
  location: string,
  routes: readonly RouteDefinition[],
): RouteMatch | undefined {
  const actual = segmentsOf(location);
  for (const route of routes) {
    const params = paramsOf(segmentsOf(route.path), actual);
    if (params !== undefined) return { route, params };
  }
  return undefined;
}
