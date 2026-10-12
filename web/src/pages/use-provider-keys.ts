import { useCallback, useEffect, useState } from 'preact/hooks';
import { listKeys } from '../api/account.js';
import type { ApiClient, ApiFailure } from '../api/client.js';
import type { KeyProvider, KeySummary } from '../api/schemas.js';

// RF-1104: the user's saved keys as the settings page shows them. Only provider, last four
// characters and update time ever arrive; the page keeps nothing else.

type KeysState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly keys: readonly KeySummary[] }
  | { readonly status: 'failed'; readonly error: ApiFailure };

export interface ProviderKeys {
  readonly state: KeysState;
  /** A key was saved or replaced. */
  readonly saved: (summary: KeySummary) => void;
  /** A key was deleted. */
  readonly removed: (provider: KeyProvider) => void;
}

// RF-1104
export function useProviderKeys(client: ApiClient): ProviderKeys {
  const [state, setState] = useState<KeysState>({ status: 'loading' });

  useEffect(() => {
    const abort = new AbortController();
    void listKeys(client, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', keys: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client]);

  const saved = useCallback((summary: KeySummary) => {
    setState((before) =>
      before.status === 'ready'
        ? {
            status: 'ready',
            keys: [...before.keys.filter((key) => key.provider !== summary.provider), summary],
          }
        : before,
    );
  }, []);

  const removed = useCallback((provider: KeyProvider) => {
    setState((before) =>
      before.status === 'ready'
        ? { status: 'ready', keys: before.keys.filter((key) => key.provider !== provider) }
        : before,
    );
  }, []);

  return { state, saved, removed };
}
