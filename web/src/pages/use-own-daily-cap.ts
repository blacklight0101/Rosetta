import { useEffect, useState } from 'preact/hooks';
import { getOwnDailyCap } from '../api/account.js';
import { useApp } from '../app/app-context.js';

// DEC-107, RF-1001: the user's daily cap on their own keys, for the start page's warning. An answer
// that does not come leaves it unknown (null): the warning is then left out, never invented.

// DEC-107
export function useOwnDailyCap(): bigint | null {
  const { client } = useApp();
  const [cap, setCap] = useState<bigint | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void getOwnDailyCap(client, abort.signal).then((result) => {
      if (abort.signal.aborted || !result.ok) return;
      setCap(result.value === null ? null : BigInt(result.value));
    });
    return () => {
      abort.abort();
    };
  }, [client]);
  return cap;
}
