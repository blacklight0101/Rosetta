import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { resumeRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';

// RF-006: the Resume button of an understand run that stopped at a cap, failed or was interrupted.
// It asks the server to queue the same run again (`runId` is the run's id, not its folder name); the
// page that owns the button decides what to show next. A refused request shows its code and leaves
// the button, so it can be pressed again.

export interface ResumeButtonProps {
  readonly runId: string;
  /** The accessible name when the word repeats in a list ("Resume run 2026...-understand"). */
  readonly ariaLabel?: string;
  /** The word on the button; "Resume run" unless the page says it in its own words. */
  readonly label?: string;
  readonly onResumed: () => void;
  /** P7-26: write the overview alone ("Write the overview"). */
  readonly overviewOnly?: boolean;
}

// RF-006
export function ResumeButton(props: ResumeButtonProps): JSX.Element {
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>();
  const resume = (): void => {
    setBusy(true);
    setError(undefined);
    void resumeRun(client, props.runId, props.overviewOnly === true).then((result) => {
      setBusy(false);
      if (result.ok) props.onResumed();
      else setError(result.error);
    });
  };
  return (
    <>
      <Button
        variant="primary"
        busy={busy}
        onClick={resume}
        {...(props.ariaLabel === undefined ? {} : { ariaLabel: props.ariaLabel })}
      >
        {props.label ?? 'Resume run'}
      </Button>
      {error === undefined ? null : <ErrorBanner error={error} />}
    </>
  );
}
