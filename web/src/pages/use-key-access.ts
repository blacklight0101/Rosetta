import { useEffect, useState } from 'preact/hooks';
import { getKeyAccess } from '../api/account.js';
import type { KeyAccess } from '../api/schemas.js';
import { useApp } from '../app/app-context.js';

// RF-436, DEC-225: which providers the signed-in user can use a key for. Undefined until the answer
// comes and when it cannot be had: no provider counts as usable through a key, and the warning of
// P8-74 says nothing about keys.

// RF-436
export function useKeyAccess(): readonly KeyAccess[] | undefined {
  const { client } = useApp();
  const [access, setAccess] = useState<readonly KeyAccess[] | undefined>();
  useEffect(() => {
    const abort = new AbortController();
    void getKeyAccess(client, abort.signal).then((result) => {
      if (!abort.signal.aborted && result.ok) setAccess(result.value);
    });
    return () => {
      abort.abort();
    };
  }, [client]);
  return access;
}
