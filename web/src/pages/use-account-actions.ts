import { useState } from 'preact/hooks';
import { changeUser } from '../api/admin.js';
import type { Account } from '../api/admin-schemas.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1102: disabling and enabling an account. The server ends the sessions of a disabled account at
// once (RF-1101); the page shows the new state the server answered and says so.

export interface AccountActions {
  /** The account whose change is in flight. */
  readonly busyId: string | undefined;
  readonly notice: string;
  readonly failure: ApiFailure | undefined;
  readonly say: (notice: string) => void;
  readonly change: (
    account: { readonly id: string; readonly userName: string },
    change: 'disable' | 'enable',
  ) => Promise<void>;
}

// RF-1102
export function useAccountActions(onChanged: (account: Account) => void): AccountActions {
  const { client } = useApp();
  const [busyId, setBusyId] = useState<string | undefined>();
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const change: AccountActions['change'] = async (account, kind) => {
    setBusyId(account.id);
    setFailure(undefined);
    setNotice('');
    const result = await changeUser(client, account.id, kind);
    setBusyId(undefined);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    onChanged(result.value);
    setNotice(
      kind === 'disable'
        ? `Disabled ${account.userName}. Their sessions ended at once.`
        : `Enabled ${account.userName}. They can sign in again.`,
    );
  };
  return {
    busyId,
    notice,
    failure,
    say: (text) => {
      setFailure(undefined);
      setNotice(text);
    },
    change,
  };
}
