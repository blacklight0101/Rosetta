import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { buildReport, reportFilePath } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';

// RF-504, RF-506, DEC-131: the report of a run on its live page. The owner asks for it once the run
// has ended (the server refuses a queued or running run with 409 `RST-1700`); the page then links
// the report and the run replay, which the run file route serves as pages. A 409 is told as a plain
// sentence: it can only happen when the run was not ended yet after all.

export interface RunReportProps {
  /** The run's id (the UUID). */
  readonly runId: string;
  readonly ended: boolean;
  /** Told once the server has written the report, so the stepper shows it done (P1-130). */
  readonly onBuilt?: () => void;
}

type ReportState = 'idle' | 'building' | 'built';

const inProgressCode = 'RST-1700';

function useReportBuild(
  runId: string,
  onBuilt: (() => void) | undefined,
): {
  readonly state: ReportState;
  readonly failure: ApiFailure | undefined;
  readonly build: () => void;
} {
  const { client } = useApp();
  const [state, setState] = useState<ReportState>('idle');
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const build = (): void => {
    setState('building');
    setFailure(undefined);
    void buildReport(client, runId).then((result) => {
      setState(result.ok ? 'built' : 'idle');
      if (result.ok) onBuilt?.();
      else setFailure(result.error);
    });
  };
  return { state, failure, build };
}

function Failure({ failure }: { readonly failure: ApiFailure }): JSX.Element {
  if (failure.code !== inProgressCode) return <ErrorBanner error={failure} />;
  return (
    <p class="rst-callout rst-callout--warn" role="alert">
      {failure.message} {failure.nextStep}
    </p>
  );
}

function ReportLinks({ runId }: { readonly runId: string }): JSX.Element {
  return (
    <ul class="rst-live-report__links" aria-label="The report">
      <li>
        <a href={reportFilePath(runId, 'report.html')}>Open the report</a>
      </li>
      <li>
        <a href={reportFilePath(runId, 'report.md')}>Open the report as Markdown</a>
      </li>
      <li>
        <a href={reportFilePath(runId, 'replay.html')}>Open the run replay</a>
      </li>
    </ul>
  );
}

// RF-504, RF-506
export function RunReport({ runId, ended, onBuilt }: RunReportProps): JSX.Element {
  const { state, failure, build } = useReportBuild(runId, onBuilt);
  const waiting = ended ? undefined : 'Available when the run ends.';
  return (
    <section class="rst-live-report" aria-label="Report">
      <Button
        {...(waiting === undefined ? {} : { disabledReason: waiting })}
        busy={state === 'building'}
        onClick={build}
      >
        Build report
      </Button>
      {failure === undefined ? null : <Failure failure={failure} />}
      {state === 'built' ? <ReportLinks runId={runId} /> : null}
    </section>
  );
}
