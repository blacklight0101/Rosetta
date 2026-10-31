import type { JSX } from 'preact';
import type { Project } from '../api/project-schemas.js';
import type { LastRun, ProjectOverviewRow } from '../api/overview-schemas.js';
import { FailedAreasNote } from '../components/FailedAreasNote.js';
import { Link } from '../components/Link.js';
import { RunEndBadge } from '../components/RunEndBadge.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { sourceLabel } from '../lib/source-label.js';
import { tokensText, totalCostText } from '../lib/cost-text.js';
import { mayHaveMeasures } from '../lib/understanding/measure-text.js';
import { RunMeasures } from './RunMeasures.js';

// RF-010, RF-1008, RF-1108, RF-1010, design-system.md section 14 (Projects): the table of the
// user's projects with the last run, its state (with the queue position of a queued run), the runs,
// tokens and cost of each project, and the links to start a run, open the live run and the
// settings. The table scrolls inside its own box, so the page never scrolls sideways.

const day = (instant: string): string => instant.slice(0, 'YYYY-MM-DD'.length);

function lastRunText(run: LastRun | null): string {
  if (run === null) return 'No run yet';
  if (run.queueState === 'Queued') return `${run.stage} · queued`;
  return `${run.stage} · ${day(run.endedAt ?? run.startedAt ?? run.queuedAt)}`;
}

function RunState({ run }: { readonly run: LastRun | null }): JSX.Element | null {
  if (run === null) return null;
  if (run.queueState === 'Ended' && run.endState !== null) {
    return (
      <>
        <RunEndBadge endState={run.endState} unreadAreas={run.unreadAreas} />
        <FailedAreasNote count={run.failedAreas} />
        {mayHaveMeasures(run) ? <RunMeasures runId={run.id} /> : null}
      </>
    );
  }
  return (
    <>
      <StatusBadge list="RunQueueState" value={run.queueState} />
      {run.position === null ? null : (
        <span class="rst-table__sub rst-p1105-note">position {run.position}</span>
      )}
    </>
  );
}

function Actions({ row }: { readonly row: ProjectOverviewRow }): JSX.Element {
  const { project, lastRun } = row;
  const id = encodeURIComponent(project.id);
  const hidden = <span class="rst-visually-hidden"> for {project.name}</span>;
  return (
    <div class="rst-projects__actions">
      <Link href={`/projects/${id}/start`} class="rst-button rst-button--primary">
        Start run{hidden}
      </Link>
      {lastRun?.queueState === 'Running' ? (
        <Link
          href={`/runs/${encodeURIComponent(lastRun.id)}`}
          class="rst-button rst-button--secondary"
        >
          Open live run{hidden}
        </Link>
      ) : null}
      <Link href={`/projects/${id}/settings`} class="rst-button rst-button--secondary">
        Settings{hidden}
      </Link>
    </div>
  );
}

function SourceNote({ project }: { readonly project: Project }): JSX.Element {
  if (project.sourceKind === 'github') {
    return (
      <span class="rst-table__sub rst-p1105-note">
        <span>{project.ref === '' ? 'default branch' : project.ref}</span>
        {' · '}
        <span>{project.subpath === '' ? 'whole repository' : project.subpath}</span>
      </span>
    );
  }
  if (project.source === null) {
    const need = project.sourceKind === 'workbook' ? 'Upload workbooks' : 'Upload a zip';
    return <span class="rst-table__sub rst-p1105-note">{need} to start.</span>;
  }
  return project.codeChangedSinceLastRun ? (
    <span class="rst-table__sub rst-p1105-note">Code changed since the last run.</span>
  ) : (
    <span class="rst-table__sub rst-p1105-note">{project.source.fileName}</span>
  );
}

function ProjectRow({ row }: { readonly row: ProjectOverviewRow }): JSX.Element {
  const { project, lastRun, totals } = row;
  return (
    <tr>
      <td data-label="Repository">
        <span class="rst-mono rst-zip__file">{sourceLabel(project)}</span>
        <SourceNote project={project} />
      </td>
      <td data-label="Last run">{lastRunText(lastRun)}</td>
      <td data-label="State">
        <RunState run={lastRun} />
      </td>
      <td data-label="Runs" class="rst-table__num">
        {row.runs}
      </td>
      <td data-label="Tokens" class="rst-table__num">
        {tokensText(totals)}
      </td>
      <td data-label="Cost" class="rst-table__num">
        {totalCostText(totals)}
      </td>
      <td class="rst-table__actions-cell">
        <Actions row={row} />
      </td>
    </tr>
  );
}

// RF-1008
export function ProjectRunsTable(props: {
  readonly rows: readonly ProjectOverviewRow[];
}): JSX.Element {
  return (
    <div class="rst-table-scroll rst-p1105-scroll">
      <table class="rst-table rst-table--stack">
        <caption class="rst-visually-hidden">Your projects</caption>
        <thead>
          <tr>
            <th scope="col">Repository</th>
            <th scope="col">Last run</th>
            <th scope="col">State</th>
            <th scope="col" class="rst-table__num">
              Runs
            </th>
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
          {props.rows.map((row) => (
            <ProjectRow key={row.project.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
