import type { JSX } from 'preact';
import type { ProjectOverviewRow } from '../api/overview-schemas.js';
import { Link } from '../components/Link.js';
import { RowMenu, type RowMenuItem } from '../components/RowMenu.js';

// RF-010, RF-1012, P8-99, `P8Projects` artboard: the actions of a project row: a secondary "Open"
// link to the project page and a "More actions" menu with the live run (while the latest run is
// running), the project settings and Delete project, which is disabled with the reason while a run
// is queued or running.

const activeReason = 'A run is in progress. Stop it before deleting the project.';

function menuItems(row: ProjectOverviewRow, onDelete: (projectId: string) => void): RowMenuItem[] {
  const { project, lastRun } = row;
  const id = encodeURIComponent(project.id);
  const live =
    lastRun?.queueState === 'Running'
      ? [{ label: 'Open live run', href: `/runs/${encodeURIComponent(lastRun.id)}` }]
      : [];
  const active = lastRun !== null && lastRun.queueState !== 'Ended';
  return [
    ...live,
    { label: 'Project settings', href: `/projects/${id}/settings` },
    {
      ...{ label: 'Delete project…', danger: true },
      ...(active
        ? { disabledReason: activeReason }
        : {
            onSelect: () => {
              onDelete(project.id);
            },
          }),
    },
  ];
}

// RF-010, RF-1012
export function ProjectRowActions(props: {
  readonly row: ProjectOverviewRow;
  readonly onDelete: (projectId: string) => void;
}): JSX.Element {
  const { project } = props.row;
  return (
    <div class="rst-p140-row-actions">
      <Link
        href={`/projects/${encodeURIComponent(project.id)}`}
        class="rst-button rst-button--secondary"
      >
        Open<span class="rst-visually-hidden"> for {project.name}</span>
      </Link>
      <RowMenu
        label={`More actions for ${project.name}`}
        items={menuItems(props.row, props.onDelete)}
      />
    </div>
  );
}
