import { useEffect, useState } from 'preact/hooks';
import { getEstimate } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import type { CodeAreaInfo } from '../lib/live-run/code-map-tiles.js';

// RF-1016: the areas of the project's code map with their estimated tokens and whether each is
// third-party, from the estimate the start page shows (every area, no selection). They size the
// tiles of the living code map and tell the library areas from the rest. Read once; when the
// server cannot answer, the map is drawn from the run's own agents.

// RF-1016
export function useCodeAreas(
  projectId: string,
  stage: string | undefined,
): readonly CodeAreaInfo[] | undefined {
  const { client } = useApp();
  const [areas, setAreas] = useState<readonly CodeAreaInfo[] | undefined>();
  useEffect(() => {
    if (stage !== 'understand') return undefined;
    const abort = new AbortController();
    void getEstimate(client, projectId, undefined, abort.signal).then((result) => {
      if (!abort.signal.aborted && result.ok) setAreas(result.value.areas);
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId, stage]);
  return areas;
}
