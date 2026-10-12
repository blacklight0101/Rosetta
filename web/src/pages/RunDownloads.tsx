import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import { runDownloadPath } from '../api/runs.js';

// RF-008, RF-1105: the two downloads of a run: the whole run folder and the hand-off folder, as zip
// files. Both wait until the run has ended (the server refuses a queued or running run with 409).
// Only a plan run has a hand-off folder, so the other stages do not offer it.

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
    return <Button disabledReason={props.unavailable}>{props.label}</Button>;
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
  const noHandoff = stage === 'plan' ? undefined : 'Only a plan run has a hand-off folder.';
  return (
    <div class="rst-live-downloads" role="group" aria-label="Downloads">
      <Download label="Download zip" href={runDownloadPath(runId, 'zip')} unavailable={waiting} />
      <Download
        label="Download hand-off zip"
        href={runDownloadPath(runId, 'handoff')}
        unavailable={waiting ?? noHandoff}
      />
    </div>
  );
}
