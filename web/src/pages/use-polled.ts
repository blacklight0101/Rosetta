import { useEffect, useState } from 'preact/hooks';
import type { ApiClient, ApiFailure, ApiResult } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1011: a read the page repeats while the run goes on. The first read shows the panel or its
// error; a later read that fails keeps what the page has and tries again; the repeating stops with
// the first answer that says the run has ended, and when the page is left.

export type Polled<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly value: T };

/** How often the panels read again while the run goes on. */
export const POLL_MS = 2000;

type Read<T> = (client: ApiClient, signal: AbortSignal) => Promise<ApiResult<T>>;

// RF-1011
export function usePolled<T extends { readonly runState: string }>(
  read: Read<T>,
  key: string,
): Polled<T> {
  const { client } = useApp();
  const [state, setState] = useState<Polled<T>>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const tick = async (): Promise<void> => {
      const result = await read(client, abort.signal);
      if (abort.signal.aborted) return;
      if (result.ok) setState({ status: 'ready', value: result.value });
      else if (first) setState({ status: 'failed', error: result.error });
      if (first && !result.ok) return;
      first = false;
      if (result.ok && result.value.runState === 'Ended') return;
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
    // `read` closes over the run id that `key` carries, so `key` is what changes the read.
  }, [client, key]);
  return state;
}
