import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { getPlanEstimate } from '../api/plan.js';
import type { PlanEstimate } from '../api/plan-schemas.js';
import { useApp } from '../app/app-context.js';

// RF-613, RF-614: loads the estimate of the plan run for one project, measured from its source run, once
// its brief is saved (the server refuses it before, RST-1801), and again when the brief changes.

export type EstimateLoad =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly estimate: PlanEstimate };

// RF-613
export function usePlanEstimate(
  request: { readonly projectId: string; readonly sourceRunId: string | undefined },
  enabled: boolean,
): {
  readonly load: EstimateLoad;
  readonly reload: () => void;
} {
  const { client } = useApp();
  const { projectId, sourceRunId } = request;
  const [load, setLoad] = useState<EstimateLoad>({ status: enabled ? 'loading' : 'idle' });
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const abort = new AbortController();
    setLoad((now) => (now.status === 'idle' ? { status: 'loading' } : now));
    void getPlanEstimate(client, projectId, sourceRunId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setLoad(
        result.ok
          ? { status: 'ready', estimate: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId, sourceRunId, round, enabled]);
  const reload = useCallback(() => {
    setRound((each) => each + 1);
  }, []);
  return { load, reload };
}
