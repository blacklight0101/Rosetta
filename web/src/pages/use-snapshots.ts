import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { listSnapshots } from '../api/history.js';
import type { Snapshot } from '../api/history-schemas.js';
import { useApp } from '../app/app-context.js';

// RF-1012, RF-1102: loads the downloaded snapshots for the administrator. Anyone else is refused
// with 403 and the page shows that error and no table.

export type SnapshotsLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly snapshots: readonly Snapshot[] };

// RF-1012
export function useSnapshots(): {
  readonly state: SnapshotsLoad;
  readonly forget: (key: string) => void;
} {
  const { client } = useApp();
  const [state, setState] = useState<SnapshotsLoad>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    void listSnapshots(client, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', snapshots: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client]);
  const forget = (key: string): void => {
    setState((current) =>
      current.status === 'ready'
        ? { status: 'ready', snapshots: current.snapshots.filter((each) => each.key !== key) }
        : current,
    );
  };
  return { state, forget };
}
