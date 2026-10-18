import { useLocation } from './router.js';

// RF-614: one parameter of the current location's query string (`?run=<id>`), read again when the
// location changes; undefined when it is absent or empty.

// RF-614
export function useQueryParam(name: string): string | undefined {
  const location = useLocation();
  const [, query = ''] = location.split('#', 1)[0]?.split('?', 2) ?? [];
  const value = new URLSearchParams(query).get(name);
  return value === null || value === '' ? undefined : value;
}
