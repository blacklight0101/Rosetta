import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import {
  readConsent,
  withdrawConsent,
  type ConsentStart,
  type HeldConsent,
} from '../api/consent.js';
import { useApp } from '../app/app-context.js';

// RF-143, DEC-209 (P8-81): the consent of the project that holds for the start a page makes. While
// it is read, and when the read fails, the page shows the boxes as before (no consent holds), so a
// start is never sent without either. Withdraw withdraws it and the boxes come back. The read is
// made again when `refresh` changes (the roles changed, or a start was refused for the consent).

export interface HeldConsentState {
  /** The consent that holds; undefined while it is read or when none does. */
  readonly consent: HeldConsent | undefined;
  /** The read has not answered yet. */
  readonly reading: boolean;
  readonly withdraw: () => void;
  readonly withdrawing: boolean;
  /** Why the withdrawal failed. */
  readonly error: ApiFailure | undefined;
}

function useWithdraw(projectId: string, onWithdrawn: () => void) {
  const { client } = useApp();
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>(undefined);
  const withdraw = (): void => {
    setWithdrawing(true);
    setError(undefined);
    void withdrawConsent(client, projectId).then((result) => {
      setWithdrawing(false);
      if (result.ok) onWithdrawn();
      else setError(result.error);
    });
  };
  return { withdraw, withdrawing, error };
}

// RF-143
export function useHeldConsent(
  projectId: string,
  start: ConsentStart,
  refresh: string,
): HeldConsentState {
  const { client } = useApp();
  const [consent, setConsent] = useState<HeldConsent | undefined>(undefined);
  const [reading, setReading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    setReading(true);
    void readConsent(client, { projectId, start }, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setConsent(result.ok ? result.value : undefined);
      setReading(false);
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId, start, refresh]);
  const withdrawal = useWithdraw(projectId, () => {
    setConsent(undefined);
  });
  return { consent, reading, ...withdrawal };
}
