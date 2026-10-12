import { useEffect, useState } from 'preact/hooks';
import { getAccountTotals } from '../api/cost.js';
import type { AccountTotals } from '../api/cost-schemas.js';
import { useApp } from './app-context.js';

// RF-1010, RF-1106: the totals pill's figures, read from the ledger when the shell opens and again
// each time `version` changes (a page announced a model call). The last figures stay on screen
// while the next ones load; a failed read keeps them, as the pill is never the page's error.

// RF-1010
export function useAccountTotals(version: number): AccountTotals | undefined {
  const { client } = useApp();
  const [totals, setTotals] = useState<AccountTotals | undefined>();
  useEffect(() => {
    const abort = new AbortController();
    void getAccountTotals(client, abort.signal).then((result) => {
      if (result.ok && !abort.signal.aborted) setTotals(result.value);
    });
    return () => {
      abort.abort();
    };
  }, [client, version]);
  return totals;
}
