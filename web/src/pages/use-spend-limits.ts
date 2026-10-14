import { useEffect, useState } from 'preact/hooks';
import { getSpendLimits } from '../api/account.js';
import type { SpendLimits } from '../api/limits-schemas.js';
import { useApp } from '../app/app-context.js';

// RF-1001, RF-1106, DEC-107, DEC-108: what is left of the user's day, the server's month and the
// own daily cap, for the start page's warning. An answer that does not come leaves it unknown
// (undefined): the limit warnings are then left out, never invented.

// RF-1106
export function useSpendLimits(): SpendLimits | undefined {
  const { client } = useApp();
  const [limits, setLimits] = useState<SpendLimits | undefined>(undefined);
  useEffect(() => {
    const abort = new AbortController();
    void getSpendLimits(client, abort.signal).then((result) => {
      if (abort.signal.aborted || !result.ok) return;
      setLimits(result.value);
    });
    return () => {
      abort.abort();
    };
  }, [client]);
  return limits;
}
