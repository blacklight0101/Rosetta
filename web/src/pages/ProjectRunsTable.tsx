import type { JSX } from 'preact';
import { queueText } from '../lib/live-run/queue-text.js';
import type { Project } from '../api/project-schemas.js';
import type { LastRun, ProjectOverviewRow } from '../api/overview-schemas.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { FailedAreasNote } from '../components/FailedAreasNote.js';
import { Link } from '../components/Link.js';
import { RunEndBadge } from '../components/RunEndBadge.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { startedText } from '../lib/run-times.js';
import { tokensText, totalCostText } from '../lib/cost-text.js';
import { mayHaveMeasures } from '../lib/understanding/measure-text.js';
import { DeletionNotice } from './DeletionNotice.js';
import { ProjectDialog } from './history-dialogs.js';
import { ProjectRowActions } from './ProjectRowActions.js';
import { RunMeasures } from './RunMeasures.js';
import { useProjectDelete } from './use-project-delete.js';

// RF-010, RF-1008, RF-1108, RF-1010, RF-1012, design-system.md section 14 (Projects), `P8Projects`
// artboard: the table of the user's projects with the project name as a link to its page, its source
// as a badge, the last run with its date and time, its state (with the queue position of a queued
// run), the runs, tokens and cost of each project, an "Open" link and the row menu (settings, live
// run, Delete project). The table scrolls inside its own box, so the page never scrolls sideways.

const sourceBadge: Readonly<Record<Project['sourceKind'], string>> = {
  github: 'GitHub',
  upload: 'Zip',
  workbook: 'Excel workbooks',
};

function lastRunText(run: LastRun | null): string {
  if (run === null) return 'No run yet';
  if (run.queueState === 'Queued') return `${run.stage} · queued`;
  return `${run.stage} · ${startedText(run.endedAt ?? run.startedAt ?? run.queuedAt)}`;
}

function RunState({ run }: { readonly run: LastRun | null }): JSX.Element | null {
  if (run === null) return null;
  if (run.queueState === 'Ended' && run.endState !== null) {
    return (
      <>
        <RunEndBadge
          {...{ endState: run.endState, endReason: run.endReason }}
          unreadAreas={run.unreadAreas}
        />
        <FailedAreasNote count={run.failedAreas} />
        {mayHaveMeasures(run) ? <RunMeasures runId={run.id} /> : null}
      </>
    );
  }
  return (
    <>
      <StatusBadge list="RunQueueState" value={run.queueState} />
      {run.position === null ? null : (
        <span class="rst-table__sub rst-p1105-note">{queueText(run.position)}</span>
      )}
    </>
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

function ProjectRow(props: {
  readonly row: ProjectOverviewRow;
  readonly onDelete: (projectId: string) => void;
}): JSX.Element {
  const { row } = props;
  const { project, lastRun, totals } = row;
  return (
    <tr>
      <td data-label="Project">
        <Link href={`/projects/${encodeURIComponent(project.id)}`} class="rst-zip__file">
          {project.name}
        </Link>
        <SourceNote project={project} />
      </td>
      <td data-label="Source">
        <span class="rst-badge rst-badge--neutral-tint">{sourceBadge[project.sourceKind]}</span>
      </td>
      <td data-label="State">
        <RunState run={lastRun} />
      </td>
      <td data-label="Last run">{lastRunText(lastRun)}</td>
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
        <ProjectRowActions row={row} onDelete={props.onDelete} />
      </td>
    </tr>
  );
}

// RF-1008, RF-1012
export function ProjectRunsTable(props: {
  readonly rows: readonly ProjectOverviewRow[];
  /** Reads the list again after a project was deleted. */
  readonly onChanged: () => void;
}): JSX.Element {
  const remove = useProjectDelete(props.onChanged);
  const error = remove.lookupError ?? remove.deletion.error;
  return (
    <>
      {remove.deletion.notice === '' ? null : <DeletionNotice text={remove.deletion.notice} />}
      {error === undefined ? null : <ErrorBanner error={error} />}
      <div class="rst-table-scroll rst-p1105-scroll">
        <table class="rst-table rst-table--stack">
          <caption class="rst-visually-hidden">Your projects</caption>
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Source</th>
              <th scope="col">State</th>
              <th scope="col">Last run</th>
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
              <ProjectRow key={row.project.id} row={row} onDelete={remove.ask} />
            ))}
          </tbody>
        </table>
      </div>
      <ProjectDialog deletion={remove.deletion} />
    </>
  );
}
