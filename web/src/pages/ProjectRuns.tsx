import type { JSX } from 'preact';
import type { HistoryRun } from '../api/history-schemas.js';
import { Link } from '../components/Link.js';
import { RunEndBadge } from '../components/RunEndBadge.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { stateLists } from '../components/badge-specs.js';
import { costLabel } from '../lib/live-run/format.js';
import { runningTimeText, startedText } from '../lib/run-times.js';

// RF-1008, RF-1021, DEC-211 (P8-26, P8Project): the runs of the project on its page, newest first, each
// a link to its run page with its kind, state, start, running time and cost. History keeps the full
// table with downloads and deletion; this one is to find the live run and the one that wrote the package.

const kindOf = (run: HistoryRun): string => run.stage.charAt(0).toUpperCase() + run.stage.slice(1);

function State({ run }: { readonly run: HistoryRun }): JSX.Element {
  const ended = stateLists.RunEndState.find((each) => each === run.endState);
  if (run.queueState === 'Ended' && ended !== undefined) {
    return (
      <RunEndBadge
        {...{ endState: ended, endReason: run.endReason }}
        unreadAreas={run.unreadAreas}
      />
    );
  }
  return <StatusBadge list="RunQueueState" value={run.queueState} />;
}

function Row({ run }: { readonly run: HistoryRun }): JSX.Element {
  return (
    <tr>
      <td data-label="Run">
        <Link href={`/runs/${encodeURIComponent(run.id)}`} class="rst-mono">
          {run.runId}
        </Link>
      </td>
      <td data-label="Kind">{kindOf(run)}</td>
      <td data-label="State">
        <State run={run} />
      </td>
      <td data-label="Started">{startedText(run.startedAt ?? run.queuedAt)}</td>
      <td data-label="Running time">{runningTimeText(run.runningMs)}</td>
      <td data-label="Cost" class="rst-table__num">
        {run.totals.costMicros === 0 ? 'No cost' : costLabel(run.totals.costMicros)}
      </td>
    </tr>
  );
}

// RF-1008
export function ProjectRuns({
  runs,
}: {
  readonly runs: readonly HistoryRun[];
}): JSX.Element | null {
  if (runs.length === 0) return null;
  return (
    <section class="rst-card rst-p826-runs" aria-labelledby="runs-heading">
      <h2 id="runs-heading" class="rst-settings__heading">
        Runs of this project
      </h2>
      <div class="rst-table-scroll">
        <table class="rst-table rst-table--stack">
          <caption class="rst-visually-hidden">Runs of this project</caption>
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Kind</th>
              <th scope="col">State</th>
              <th scope="col">Started</th>
              <th scope="col">Running time</th>
              <th scope="col" class="rst-table__num">
                Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <Row key={run.id} run={run} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
