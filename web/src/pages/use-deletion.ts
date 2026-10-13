import { useState } from 'preact/hooks';
import type { ApiFailure, ApiResult } from '../api/client.js';
import type { Deleted } from '../api/history-schemas.js';

// RF-1012: the state of one confirmed deletion on a page: what is waiting for the answer to "are you
// sure", whether the call is under way, the refusal the server gave and the notice of the last
// deletion that went through. `done` runs after the server removed the target and gives the notice.

export interface DeletionOptions<T> {
  readonly remove: (target: T) => Promise<ApiResult<Deleted>>;
  /** Updates the page after a removal and returns the notice to show. */
  readonly done: (target: T, deleted: Deleted) => string;
}

export interface Deletion<T> {
  /** The target the dialog is asking about; undefined while no dialog is open. */
  readonly pending: T | undefined;
  readonly busy: boolean;
  readonly error: ApiFailure | undefined;
  readonly notice: string;
  readonly ask: (target: T) => void;
  readonly cancel: () => void;
  readonly confirm: () => void;
}

// RF-1012
export function useDeletion<T>(options: DeletionOptions<T>): Deletion<T> {
  const [pending, setPending] = useState<T | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const confirm = (): void => {
    if (pending === undefined || busy) return;
    setBusy(true);
    void options.remove(pending).then((result) => {
      setBusy(false);
      setPending(undefined);
      setError(result.ok ? undefined : result.error);
      setNotice(result.ok ? options.done(pending, result.value) : '');
    });
  };
  const ask = (target: T): void => {
    setError(undefined);
    setNotice('');
    setPending(target);
  };
  return {
    pending,
    busy,
    error,
    notice,
    ask,
    confirm,
    cancel: () => {
      setPending(undefined);
    },
  };
}
