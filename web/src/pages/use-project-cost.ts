import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { getProjectCost } from '../api/cost.js';
import type { ProjectCost } from '../api/cost-schemas.js';
import { useApp } from '../app/app-context.js';

// RF-428, RF-1105: loads the cost page of one of the signed-in user's projects. Another user's
// project answers 404 like an unknown one, so the page shows that error and no table.

type CostLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly cost: ProjectCost };

// RF-428
export function useProjectCost(projectId: string): CostLoad {
  const { client } = useApp();
  const [state, setState] = useState<CostLoad>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    setState({ status: 'loading' });
    void getProjectCost(client, projectId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', cost: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId]);
  return state;
}
