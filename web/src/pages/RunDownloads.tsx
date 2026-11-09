import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import { runDownloadPath } from '../api/runs.js';

// RF-008, RF-1105, RF-1015 (P8-27): the downloads of a run: the whole run folder and, for a plan run
// only, the hand-off folder, as zip files. Both wait until the run has ended (the server refuses a
// queued or running run with 409), and a button that waits says why in visible text. A download that
// can never apply to the kind of run is not drawn.

export interface RunDownloadsProps {
  readonly runId: string;
  readonly stage: string;
  readonly ended: boolean;
}

function Download(props: {
  readonly label: string;
  readonly href: string;
  readonly unavailable: string | undefined;
}): JSX.Element {
  if (props.unavailable !== undefined) {
    return (
      <span class="rst-live-download">
        <Button disabledReason={props.unavailable}>{props.label}</Button>
        <span class="rst-live-download__why">{props.unavailable}</span>
      </span>
    );
  }
  return (
    <a class="rst-button rst-button--secondary" href={props.href} download>
      {props.label}
    </a>
  );
}

// RF-008
export function RunDownloads({ runId, stage, ended }: RunDownloadsProps): JSX.Element {
  const waiting = ended ? undefined : 'Available when the run ends.';
  return (
    <div class="rst-live-downloads" role="group" aria-label="Downloads">
      <Download label="Download zip" href={runDownloadPath(runId, 'zip')} unavailable={waiting} />
      {stage === 'plan' ? (
        <Download
          label="Download hand-off zip"
          href={runDownloadPath(runId, 'handoff')}
          unavailable={waiting}
        />
      ) : null}
    </div>
  );
}
