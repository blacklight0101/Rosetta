import { useEffect, useState } from 'preact/hooks';
import { getCaps, listUsers } from '../api/admin.js';
import type { Caps, ListedAccount } from '../api/admin-schemas.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1102, RF-1106: what every administration page starts from, the accounts and the caps. The
// accounts give the month to date for the meter and the banner, and the names the audit page shows;
// the caps give the monthly limit.

export type Overview =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly users: readonly ListedAccount[]; readonly caps: Caps };

export interface OverviewEditor {
  readonly overview: Overview;
  readonly setUsers: (
    change: (users: readonly ListedAccount[]) => readonly ListedAccount[],
  ) => void;
  readonly setCaps: (caps: Caps) => void;
}

// RF-1102
export function useAdminOverview(): OverviewEditor {
  const { client } = useApp();
  const [overview, setOverview] = useState<Overview>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all([listUsers(client, abort.signal), getCaps(client, abort.signal)]).then(
      ([users, caps]) => {
        if (abort.signal.aborted) return;
        if (!users.ok) setOverview({ status: 'failed', error: users.error });
        else if (!caps.ok) setOverview({ status: 'failed', error: caps.error });
        else setOverview({ status: 'ready', users: users.value, caps: caps.value });
      },
    );
    return () => {
      abort.abort();
    };
  }, [client]);
  return {
    overview,
    setUsers: (change) => {
      setOverview((current) =>
        current.status === 'ready' ? { ...current, users: change(current.users) } : current,
      );
    },
    setCaps: (caps) => {
      setOverview((current) => (current.status === 'ready' ? { ...current, caps } : current));
    },
  };
}
