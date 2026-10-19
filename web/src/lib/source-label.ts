import type { Project } from '../api/project-schemas.js';

// RF-128, RFC-004 section 4.5: how a project's source reads in the projects list and on the start
// page. A GitHub project is its name; an upload is `OrderDesk (zip, 19 Oct 2026)`, or
// `OrderDesk (zip, no source)` while no zip is stored. Names are text and stay text.

const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `19 Oct 2026` from an ISO instant (UTC, like the dates the pages show elsewhere). */
function uploadDateText(instant: string): string {
  const month = months[Number(instant.slice(5, 7)) - 1] ?? instant.slice(5, 7);
  return `${String(Number(instant.slice(8, 10)))} ${month} ${instant.slice(0, 4)}`;
}

// RF-128
export function sourceLabel(project: Pick<Project, 'name' | 'sourceKind' | 'source'>): string {
  if (project.sourceKind !== 'upload') return project.name;
  const when = project.source === null ? 'no source' : uploadDateText(project.source.uploadedAt);
  return `${project.name} (zip, ${when})`;
}
