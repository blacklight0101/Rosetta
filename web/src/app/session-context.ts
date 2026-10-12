import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Session } from '../api/schemas.js';

// P1-14: the signed-in user, for the pages that draw their own header and the pages that need the
// user name. The application provides it once the server has answered `GET /api/session`.

export type SignedInUser = Session['user'];

export const SessionContext = createContext<SignedInUser | undefined>(undefined);

export function useUser(): SignedInUser {
  const user = useContext(SessionContext);
  if (user === undefined) throw new Error('A signed-in page was drawn without a session.');
  return user;
}
