import { createContext } from 'preact';

// Stub for the red commit: the parameters of the current route, read by a page (P1-41).

export const RouteParamsContext = createContext<Readonly<Record<string, string>>>({});

export function useRouteParams(): Readonly<Record<string, string>> {
  return {};
}
