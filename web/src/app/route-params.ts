import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

// P1-41: the parameters of the current route (`/projects/:projectId/settings` gives `projectId`),
// provided by the application around the page it draws.

export const RouteParamsContext = createContext<Readonly<Record<string, string>>>({});

export function useRouteParams(): Readonly<Record<string, string>> {
  return useContext(RouteParamsContext);
}
