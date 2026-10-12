import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ApiClient } from '../api/client.js';

// P1-14: what every page needs from the application: the typed API client and the way to leave for
// another page with a full page load (the server decides what that page is).

export interface AppServices {
  readonly client: ApiClient;
  readonly assign: (path: string) => void;
}

export const AppContext = createContext<AppServices | undefined>(undefined);

export function useApp(): AppServices {
  const services = useContext(AppContext);
  if (services === undefined) throw new Error('A page was drawn outside the application.');
  return services;
}
