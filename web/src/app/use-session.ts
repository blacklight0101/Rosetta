import { useEffect, useState } from 'preact/hooks';
import type { ApiClient, ApiFailure } from '../api/client.js';
import type { Session } from '../api/schemas.js';
import { loadSession } from '../api/session.js';

// RF-1009, RF-1100: asks the server who is signed in. The server decides; the page only reflects
// it. A 401 means no session, and the page leaves for the sign-in page.

export type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly session: Session }
  | { readonly status: 'failed'; readonly error: ApiFailure };

const notSignedIn = 401;

// RF-1100
export function useSession(client: ApiClient, onSignedOut: () => void): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    void loadSession(client, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      if (result.ok) setState({ status: 'ready', session: result.value });
      else if (result.error.status === notSignedIn) onSignedOut();
      else setState({ status: 'failed', error: result.error });
    });
    return () => {
      abort.abort();
    };
  }, [client, onSignedOut]);
  return state;
}
