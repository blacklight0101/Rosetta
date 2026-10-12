import { useEffect, useState } from 'preact/hooks';
import { followRunEvents, type StreamStatus } from '../api/follow-run-events.js';
import type { ApiFailure } from '../api/client.js';
import type { RunEvent } from '../api/run-events.js';
import { applyEvent, initialRunState } from '../lib/live-run/reduce-run.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1002, RF-1006: the state of a run, built from its event stream: the stored events first, then
// the live ones, and again from the last event after a break. Events that arrive together are
// applied together, so a long replay draws the page once, not once per event.

export interface RunStream {
  readonly state: RunState;
  readonly connection: StreamStatus;
  /** What the server answered when it refused the stream. */
  readonly failure: ApiFailure | undefined;
}

/** Follows the stream once `enabled` (the run is known to be the user's own). */
// RF-1006
export function useRunStream(runId: string, enabled: boolean): RunStream {
  const [state, setState] = useState<RunState>(initialRunState);
  const [connection, setConnection] = useState<StreamStatus>('connecting');
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  useEffect(() => {
    if (!enabled) return undefined;
    const abort = new AbortController();
    const waiting: RunEvent[] = [];
    const flush = (): void => {
      const batch = waiting.splice(0);
      if (batch.length > 0 && !abort.signal.aborted) {
        setState((current) => batch.reduce(applyEvent, current));
      }
    };
    setState(initialRunState());
    setFailure(undefined);
    void followRunEvents({
      runId,
      send: (path, init) => globalThis.fetch(path, init),
      signal: abort.signal,
      onEvent: (event) => {
        waiting.push(event);
        if (waiting.length === 1) queueMicrotask(flush);
      },
      onStatus: (status, refused) => {
        setConnection(status);
        setFailure(refused);
      },
    });
    return () => {
      abort.abort();
    };
  }, [runId, enabled]);
  return { state, connection, failure };
}
