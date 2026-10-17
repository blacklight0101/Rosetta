import { useEffect, useState } from 'preact/hooks';
import { getAnsweredCount } from '../api/answers.js';
import { useApp } from '../app/app-context.js';

// RF-241: how many questions of the project have an answer and are still Open. A count that cannot
// be read is none: the start page then simply does not offer the re-run with answers.

export function useAnsweredCount(projectId: string): number {
  const { client } = useApp();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void getAnsweredCount(client, projectId, abort.signal).then((result) => {
      if (!abort.signal.aborted) setCount(result.ok ? result.value : 0);
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId]);
  return count;
}
