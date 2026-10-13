import { useEffect, useState } from 'preact/hooks';
import { getCallTranscript } from '../api/calls.js';
import type { TranscriptRow } from '../api/call-schemas.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1011, RF-408: the masked transcript of the selected call, read when it is selected.

export type TranscriptLoad =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly entries: readonly TranscriptRow[] };

// RF-1011
export function useCallTranscript(
  runId: string,
  seq: number | undefined,
  has: boolean,
): TranscriptLoad {
  const { client } = useApp();
  const [load, setLoad] = useState<TranscriptLoad>({ status: 'none' });
  useEffect(() => {
    if (seq === undefined || !has) {
      setLoad({ status: 'none' });
      return undefined;
    }
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    void getCallTranscript(client, runId, seq, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setLoad(
        result.ok
          ? { status: 'ready', entries: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, runId, seq, has]);
  return load;
}
