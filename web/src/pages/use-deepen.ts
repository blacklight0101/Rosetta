import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import {
  estimateDeepen,
  startDeepen,
  type DeepenChoice,
  type DeepenEstimate,
} from '../api/understanding.js';
import { useApp } from '../app/app-context.js';
import { navigate } from '../app/router.js';

// RF-209, RF-425, RF-143: the state of the Deepen panel: the round limit and the coverage pass the
// owner chose, the estimate for that choice (read again whenever it changes; it starts nothing), and
// the start, which happens only on the owner's confirmation and opens the new run. A refusal stays
// on the page.

export type DeepenEstimateLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly estimate: DeepenEstimate };

/** DEC-145 (Q-H): three rounds unless the owner chooses another number from 1 to 5. */
const DEFAULT_CHOICE: DeepenChoice = { maxRounds: 3, coveragePass: true };

// RF-209
export function useDeepenEstimate(runId: string, choice: DeepenChoice): DeepenEstimateLoad {
  const { client } = useApp();
  const [load, setLoad] = useState<DeepenEstimateLoad>({ status: 'loading' });
  const { maxRounds, coveragePass } = choice;
  useEffect(() => {
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    void estimateDeepen(client, runId, { maxRounds, coveragePass }, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setLoad(
        result.ok
          ? { status: 'ready', estimate: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, runId, maxRounds, coveragePass]);
  return load;
}

export interface DeepenStart {
  readonly choice: DeepenChoice;
  readonly setChoice: (choice: DeepenChoice) => void;
  readonly consent: boolean;
  readonly setConsent: (consent: boolean) => void;
  readonly busy: boolean;
  readonly error: ApiFailure | undefined;
  /** Starts the Deepen the owner confirmed and opens its run. */
  readonly start: () => void;
}

// RF-209, RF-143
export function useDeepenStart(runId: string): DeepenStart {
  const { client } = useApp();
  const [choice, setChoice] = useState<DeepenChoice>(DEFAULT_CHOICE);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>(undefined);
  const start = (): void => {
    setBusy(true);
    setError(undefined);
    void startDeepen(client, runId, { ...choice, cloudConsent: consent }).then((result) => {
      if (result.ok) {
        navigate(`/runs/${encodeURIComponent(result.value.id)}`);
        return;
      }
      setBusy(false);
      setError(result.error);
    });
  };
  return { choice, setChoice, consent, setConsent, busy, error, start };
}
