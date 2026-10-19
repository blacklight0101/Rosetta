import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { getPlanOptions } from '../api/plan.js';
import type { PlanOptions } from '../api/plan-schemas.js';
import { useApp } from '../app/app-context.js';

// RF-608, RF-609, RF-143: asks the planner for the architecture styles and the stack options of the
// project, once the page wants them (`wanted`) and, for a cloud planner, once the person consented.
// A failure keeps the page usable: it shows the error, offers to ask again and falls back to the
// catalogue's styles and the person's own technology.

export type OptionsLoad =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly options: PlanOptions };

export interface OptionsRequest {
  readonly projectId: string;
  /** The page needs the options (a step that shows them is open). */
  readonly wanted: boolean;
  /** The planner may be called: its kind is known, and any consent it needs is given. */
  readonly allowed: boolean;
  readonly consent: boolean;
  /** RF-614: the understand run the options are recommended from. */
  readonly sourceRunId: string | undefined;
}

// RF-608
export function usePlanOptions(request: OptionsRequest): {
  readonly load: OptionsLoad;
  readonly askAgain: () => void;
} {
  const { client } = useApp();
  const { projectId, wanted, allowed, consent, sourceRunId } = request;
  const [load, setLoad] = useState<OptionsLoad>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const start = wanted && allowed;
  useEffect(() => {
    if (!start) return undefined;
    let current = true;
    setLoad({ status: 'loading' });
    void getPlanOptions(client, projectId, { cloudConsent: consent, sourceRunId }).then(
      (result) => {
        if (!current) return;
        setLoad(
          result.ok
            ? { status: 'ready', options: result.value }
            : { status: 'failed', error: result.error },
        );
      },
    );
    return () => {
      current = false;
    };
  }, [client, projectId, start, consent, sourceRunId, attempt]);
  const askAgain = useCallback(() => {
    setAttempt((each) => each + 1);
  }, []);
  return { load, askAgain };
}
