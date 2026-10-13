import type { JSX } from 'preact';
import { runDownloadPath } from '../api/runs.js';
import type { HistoryRun } from '../api/history-schemas.js';
import { Button } from '../components/Button.js';
import { Link } from '../components/Link.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { stateLists } from '../components/badge-specs.js';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import { secondsText } from './admin-format.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-1008, RF-1012, History artboard: the runs of a project, newest first, each with its start, stage,
// commit, state, tokens and cost, the links to its run page and zip, and its Delete button, which is
// disabled with the reason while the run is queued or running. The run page link reads "View run"
// so that no control here shares a name with the Report controls of the run page (P1-97, P1-121).

export interface HistoryRunsProps {
  readonly runs: readonly HistoryRun[];
  readonly onDelete: (run: HistoryRun) => void;
}

const minutes = (instant: string): string =>
  secondsText(instant).slice(0, 'YYYY-MM-DD HH:MM'.length);

function StateBadge({ run }: { readonly run: HistoryRun }): JSX.Element {
  const ended = stateLists.RunEndState.find((each) => each === run.endState);
  if (run.queueState === 'Ended' && ended !== undefined) {
    return <StatusBadge list="RunEndState" value={ended} />;
  }
  return <StatusBadge list="RunQueueState" value={run.queueState} />;
}

function RunId({ run }: { readonly run: HistoryRun }): JSX.Element {
  const when =
    run.startedAt === null
      ? `queued ${minutes(run.queuedAt)}`
      : `started ${minutes(run.startedAt)}`;
  return (
    <>
      <div class="rst-mono">{run.runId}</div>
      <div class="rst-table__sub">{when}</div>
    </>
  );
}

function Open({ run }: { readonly run: HistoryRun }): JSX.Element {
  const hidden = (): JSX.Element => (
    <span class="rst-visually-hidden">{` of run ${run.runId}`}</span>
  );
  return (
    <>
      <Link href={`/runs/${encodeURIComponent(run.id)}`}>
        View run<span class="rst-visually-hidden">{` ${run.runId}`}</span>
      </Link>
      {' · '}
      {run.queueState === 'Ended' ? (
        <a href={runDownloadPath(run.id, 'zip')} download>
          Zip{hidden()}
        </a>
      ) : (
        <Button ariaLabel={`Zip of run ${run.runId}`} disabledReason="Available when the run ends.">
          Zip
        </Button>
      )}
    </>
  );
}

function DeleteButton(props: {
  readonly run: HistoryRun;
  readonly onDelete: (run: HistoryRun) => void;
}): JSX.Element {
  const { run } = props;
  if (run.queueState === 'Ended') {
    return (
      <Button
        variant="danger-outline"
        ariaLabel={`Delete: run ${run.runId}`}
        onClick={() => {
          props.onDelete(run);
        }}
      >
        Delete
      </Button>
    );
  }
  const label = `Delete (${run.queueState === 'Queued' ? 'queued' : 'running'})`;
  return (
    <Button
      variant="danger-outline"
      ariaLabel={`${label}: run ${run.runId}`}
      disabledReason="Stop the run before deleting it"
    >
      {label}
    </Button>
  );
}

function Row(props: {
  readonly run: HistoryRun;
  readonly onDelete: (run: HistoryRun) => void;
}): JSX.Element {
  const { run } = props;
  const { costMicros, inputTokens, outputTokens } = run.totals;
  return (
    <tr>
      <td data-label="Run">
        <RunId run={run} />
      </td>
      <td data-label="Stage">{run.stage}</td>
      <td class="rst-mono" data-label="Commit">
        {run.commitSha === null ? 'none' : run.commitSha.slice(0, 7)}
      </td>
      <td data-label="State">
        <StateBadge run={run} />
      </td>
      <td class="rst-table__num" data-label="Tokens">
        {tokensLabel(inputTokens + outputTokens)}
      </td>
      <td class="rst-table__num" data-label="Cost">
        {costLabel(costMicros)}
      </td>
      <td data-label="Open">
        <Open run={run} />
      </td>
      <td>
        <DeleteButton run={run} onDelete={props.onDelete} />
      </td>
    </tr>
  );
}

// RF-1008
export function HistoryRuns({ runs, onDelete }: HistoryRunsProps): JSX.Element {
  return (
    <ScrollRegion label="Runs table">
      <table class="rst-table rst-table--stack" aria-label="Runs">
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Stage</th>
            <th scope="col">Commit</th>
            <th scope="col">State</th>
            <th scope="col" class="rst-table__num">
              Tokens
            </th>
            <th scope="col" class="rst-table__num">
              Cost
            </th>
            <th scope="col">Open</th>
            <th scope="col">
              <span class="rst-visually-hidden">Delete</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <Row key={run.id} run={run} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
