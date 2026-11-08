import type { JSX } from 'preact';
import { runDownloadPath } from '../api/runs.js';
import { navigate } from '../app/router.js';
import type { HistoryRun } from '../api/history-schemas.js';
import { FailedAreasNote } from '../components/FailedAreasNote.js';
import { Link } from '../components/Link.js';
import {
  hasTooltip,
  MoneyAmount,
  useAmountTabStop,
  type AmountStop,
} from '../components/MoneyAmount.js';
import { RowMenu, type RowMenuItem } from '../components/RowMenu.js';
import { RunEndBadge } from '../components/RunEndBadge.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { stateLists } from '../components/badge-specs.js';
import { queueText } from '../lib/live-run/queue-text.js';
import { isResumable } from '../lib/live-run/resumable.js';
import { tokensLabel } from '../lib/live-run/format.js';
import { runKindText } from '../lib/run-kind.js';
import { runningTimeText, startedText, wallTimeNote } from '../lib/run-times.js';
import { ResumeButton } from './ResumeButton.js';
import { RunCoverage } from './RunCoverage.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-1008, RF-1012, P8-89, History artboard: the runs of a project, newest first, in the columns Run (the
// link to the run page, named "View run" so that no control here shares a name with the Report controls
// of the run page, P1-97, P1-121), Kind, Commit (GitHub projects only), State, Coverage, Started, Running
// time, Tokens and Cost, and a row menu with Zip and Delete, both disabled with the reason while the run is
// queued or running. A run that can be resumed shows its Resume button beside the menu.

export interface HistoryRunsProps {
  readonly runs: readonly HistoryRun[];
  /** P8-89: only a GitHub project pins a commit, so only it has a Commit column. */
  readonly showCommit: boolean;
  readonly onDelete: (run: HistoryRun) => void;
}

function StateBadge({ run }: { readonly run: HistoryRun }): JSX.Element {
  const ended = stateLists.RunEndState.find((each) => each === run.endState);
  if (run.queueState === 'Ended' && ended !== undefined) {
    return (
      <>
        <RunEndBadge
          {...{ endState: ended, endReason: run.endReason }}
          unreadAreas={run.unreadAreas}
          partlyReadAreas={run.partlyReadAreas}
          readShare={run.readShare}
          shareBelow
        />
        <FailedAreasNote count={run.failedAreas} />
      </>
    );
  }
  return (
    <>
      <StatusBadge list="RunQueueState" value={run.queueState} />
      {run.position === null ? null : <div class="rst-table__sub">{queueText(run.position)}</div>}
    </>
  );
}

/** P8-88, History artboard: the running time, and the wall time after it for a run that waited. */
function RunningTime({ run }: { readonly run: HistoryRun }): JSX.Element {
  const note = wallTimeNote(run.runningMs, run.wallMs);
  return (
    <>
      {runningTimeText(run.runningMs)}
      {note === null ? null : <span class="rst-table__sub">{` ${note}`}</span>}
    </>
  );
}

function RunName({ run }: { readonly run: HistoryRun }): JSX.Element {
  return (
    <Link
      href={`/runs/${encodeURIComponent(run.id)}`}
      class="rst-mono rst-p140-run-name"
      ariaLabel={`View run ${run.runId}`}
    >
      {run.runId}
    </Link>
  );
}

/** The start in its own column (the first start of a resumed run); a queued run says since when it waits. */
function startText(run: HistoryRun): string {
  return run.startedAt === null
    ? `queued ${startedText(run.queuedAt)}`
    : startedText(run.startedAt);
}

/** RF-006: Resume, for an understand run that stopped at its cap, failed or was interrupted. */
function Resume({ run }: { readonly run: HistoryRun }): JSX.Element | null {
  if (run.queueState !== 'Ended' || run.endState === null) return null;
  if (!isResumable(run.stage, run.endState)) return null;
  return (
    <ResumeButton
      runId={run.id}
      ariaLabel={`Resume run ${run.runId}`}
      onResumed={() => {
        navigate(`/runs/${encodeURIComponent(run.id)}`);
      }}
    />
  );
}

/** RF-1008, RF-1012, P8-89: Zip and Delete in the row menu, both disabled with the reason until the run ends. */
function rowMenuItems(run: HistoryRun, onDelete: (run: HistoryRun) => void): RowMenuItem[] {
  if (run.queueState !== 'Ended') {
    return [
      { label: 'Zip', disabledReason: 'Available when the run ends.' },
      { label: 'Delete', danger: true, disabledReason: 'Stop the run before deleting it' },
    ];
  }
  return [
    { label: 'Zip', href: runDownloadPath(run.id, 'zip'), download: true },
    {
      ...{ label: 'Delete', danger: true },
      onSelect: () => {
        onDelete(run);
      },
    },
  ];
}

function Row(props: {
  readonly run: HistoryRun;
  readonly showCommit: boolean;
  readonly stop: AmountStop;
  readonly onDelete: (run: HistoryRun) => void;
}): JSX.Element {
  const { run } = props;
  const { costMicros, inputTokens, outputTokens } = run.totals;
  return (
    <tr>
      <td data-label="Run">
        <RunName run={run} />
      </td>
      <td data-label="Kind">{runKindText(run.stage, run.deepenRounds)}</td>
      {props.showCommit ? (
        <td class="rst-mono" data-label="Commit">
          {run.commitSha === null ? '–' : run.commitSha.slice(0, 7)}
        </td>
      ) : null}
      <td data-label="State">
        <StateBadge run={run} />
      </td>
      <td data-label="Coverage">
        <RunCoverage run={run} />
      </td>
      <td data-label="Started">{startText(run)}</td>
      <td data-label="Running time">
        <RunningTime run={run} />
      </td>
      <td class="rst-table__num" data-label="Tokens">
        {tokensLabel(inputTokens + outputTokens)}
      </td>
      <td class="rst-table__num" data-label="Cost">
        <MoneyAmount micros={costMicros} {...props.stop} />
      </td>
      <td>
        <div class="rst-p140-row-actions">
          <Resume run={run} />
          <RowMenu
            label={`More actions for run ${run.runId}`}
            items={rowMenuItems(run, props.onDelete)}
          />
        </div>
      </td>
    </tr>
  );
}

// RF-1008
export function HistoryRuns({ runs, showCommit, onDelete }: HistoryRunsProps): JSX.Element {
  const stops = useAmountTabStop(
    runs.map((run) => ({ key: run.id, exact: hasTooltip(run.totals.costMicros) })),
  );
  return (
    <ScrollRegion label="Runs table">
      <table class="rst-table rst-table--stack rst-p140-runs" aria-label="Runs">
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Kind</th>
            {showCommit ? <th scope="col">Commit</th> : null}
            <th scope="col">State</th>
            <th scope="col">Coverage</th>
            <th scope="col">Started</th>
            <th scope="col">Running time</th>
            <th scope="col" class="rst-table__num">
              Tokens
            </th>
            <th scope="col" class="rst-table__num">
              Cost
            </th>
            <th scope="col">
              <span class="rst-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <Row
              key={run.id}
              run={run}
              showCommit={showCommit}
              stop={stops.stopOf(run.id)}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
