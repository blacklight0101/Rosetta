import { useEffect, useState } from 'preact/hooks';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { getEstimate } from '../api/runs.js';
import { useApp } from '../app/app-context.js';

// RF-424, RF-1003: the estimate to put beside what a run has used. It is the estimate the start page
// shows for the same project and the same areas, read once the agents of the run are known; a run
// that is not an understand run, or an estimate the server cannot give, leaves it out.

// RF-1003
export function useRunEstimate(
  projectId: string,
  stage: string | undefined,
  areas: readonly string[],
): RunEstimate | undefined {
  const { client } = useApp();
  const [estimate, setEstimate] = useState<RunEstimate | undefined>();
  const key = areas.join('\n');
  useEffect(() => {
    if (stage !== 'understand' || key === '') return undefined;
    const abort = new AbortController();
    void getEstimate(client, projectId, key.split('\n'), abort.signal).then((result) => {
      if (!abort.signal.aborted && result.ok) setEstimate(result.value);
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId, stage, key]);
  return estimate;
}
