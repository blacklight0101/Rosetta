import { useEffect, useState } from 'preact/hooks';
import { getPackageChecks, type PackageChecks } from '../api/package-checks.js';
import { useApp } from '../app/app-context.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1015, RF-627 (P7-25): the checks of the package a plan run wrote, from the server. They are asked
// for once the package exists: the run ended Completed, or with the gaps code RST-1806 (RF-627).

/** The package is written: the run completed, or ended with items no task card builds. */
function packageWritten(ended: RunState['ended']): boolean {
  return ended?.endState === 'Completed' || ended?.errorCode === 'RST-1806';
}

// RF-1015
export function usePackageChecks(
  runId: string,
  ended: RunState['ended'],
): PackageChecks | undefined {
  const { client } = useApp();
  const [checks, setChecks] = useState<PackageChecks | undefined>();
  const written = packageWritten(ended);
  useEffect(() => {
    if (!written) return undefined;
    const abort = new AbortController();
    void getPackageChecks(client, runId, abort.signal).then((result) => {
      if (!abort.signal.aborted && result.ok) setChecks(result.value);
    });
    return () => {
      abort.abort();
    };
  }, [client, runId, written]);
  return checks;
}
