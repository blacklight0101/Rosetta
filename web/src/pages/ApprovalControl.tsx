import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiFailure, ApiResult } from '../api/client.js';
import { cancelRun, continueRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { dollars, tokensText } from '../lib/estimate-math.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import { ResumeControl, type ResumeControlProps } from './ResumeControl.js';

// RF-432, ADR-026, design-system.md section 14: the question of a run that paused near the amount
// its owner approved. Continue (+N) raises the amount by N (the remainder of the approved journey)
// and queues the run again; Stop here ends it `CapReached` with its work saved. A refused request
// shows its code and leaves both buttons.

interface ApprovalControlProps {
  readonly runId: string;
  readonly phase: RunPhase;
  /** The run was queued again or ended; the page reloads it. */
  readonly onAnswered: () => void;
}

/** `+$0.60` for a cloud run, `+1,300,000 tokens` for a run that costs nothing. */
function extraText(amount: { readonly tokens: number; readonly costMicros: number }): string {
  return amount.costMicros > 0
    ? `+${dollars(BigInt(amount.costMicros))}`
    : `+${tokensText(amount.tokens)}`;
}

// RF-432
function ApprovalControl(props: ApprovalControlProps): JSX.Element | null {
  const { client } = useApp();
  const [busy, setBusy] = useState<'continue' | 'stop' | undefined>();
  const [error, setError] = useState<ApiFailure | undefined>();
  const { phase } = props;
  if (phase.kind !== 'awaiting') return null;
  const answer = (which: 'continue' | 'stop', call: Promise<ApiResult<undefined>>): void => {
    setBusy(which);
    setError(undefined);
    void call.then((result) => {
      setBusy(undefined);
      if (result.ok) props.onAnswered();
      else setError(result.error);
    });
  };
  const amount = phase.continueAmount;
  return (
    <>
      <span class="rst-live-head__note" data-testid="approval-question">
        The run reached the amount you approved. Continue or stop here; its work is saved.
      </span>
      <Button
        variant="primary"
        busy={busy === 'continue'}
        onClick={() => {
          answer('continue', continueRun(client, props.runId));
        }}
      >
        {amount === undefined ? 'Continue' : `Continue (${extraText(amount)})`}
      </Button>
      <Button
        variant="secondary"
        busy={busy === 'stop'}
        onClick={() => {
          answer('stop', cancelRun(client, props.runId));
        }}
      >
        Stop here
      </Button>
      {error === undefined ? null : <ErrorBanner error={error} />}
    </>
  );
}

/** RF-006, RF-432: what the run page offers once the run stopped: Resume, or the approval question. */
export function RunAnswerControls(props: ResumeControlProps): JSX.Element {
  const { phase, runId, onResumed } = props;
  return (
    <>
      <ResumeControl {...props} />
      <ApprovalControl {...{ phase, runId, onAnswered: onResumed }} />
    </>
  );
}
