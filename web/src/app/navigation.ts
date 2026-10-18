import { segmentsOf } from './route-match.js';
import type { NavGroupId, RouteDefinition } from './route-types.js';

// design-system.md section 3: the side navigation is built from the router table. A page listed
// there (`nav`) appears for the roles allowed to open it. The groups never change: main, project,
// administration (the last for the administrator only). The project group links the open project,
// or the last one opened in this browser session, and its links carry that project's id.

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly current: boolean;
}

export interface NavGroup {
  readonly id: NavGroupId;
  /** Absent for the main group, which has no heading. */
  readonly label?: string;
  readonly items: readonly NavItem[];
  readonly note?: string;
}

export type ProjectNav =
  | { readonly status: 'none' }
  | { readonly status: 'pending' }
  | { readonly status: 'open'; readonly id: string; readonly name?: string };

export interface NavigationInput {
  readonly routes: readonly RouteDefinition[];
  readonly role: 'admin' | 'user';
  /** The current location. */
  readonly path: string;
  readonly project: ProjectNav;
}

const groupOrder: readonly NavGroupId[] = ['main', 'project', 'admin'];

/** The path with its parameters filled in, or undefined when one is missing. */
function fill(pattern: string, params: Readonly<Record<string, string>>): string | undefined {
  const parts: string[] = [];
  for (const segment of segmentsOf(pattern)) {
    if (!segment.startsWith(':')) {
      parts.push(segment);
      continue;
    }
    const value = params[segment.slice(1)];
    if (value === undefined) return undefined;
    parts.push(encodeURIComponent(value));
  }
  return `/${parts.join('/')}`;
}

const openAProject = 'Open a project to see its pages';

function projectHeading(project: ProjectNav): string {
  return project.status === 'open' && project.name !== undefined
    ? `Project: ${project.name}`
    : 'Project';
}

function groupLabel(id: NavGroupId, project: ProjectNav): string | undefined {
  if (id === 'admin') return 'Administration';
  return id === 'project' ? projectHeading(project) : undefined;
}

function itemsOf(
  routes: readonly RouteDefinition[],
  id: NavGroupId,
  input: NavigationInput,
  here: string,
): readonly NavItem[] {
  const params = input.project.status === 'open' ? { projectId: input.project.id } : {};
  return routes
    .filter((route) => route.nav?.group === id)
    .filter((route) => route.access !== 'admin' || input.role === 'admin')
    .toSorted((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0))
    .flatMap((route) => {
      const path = fill(route.path, params);
      return path === undefined || route.nav === undefined
        ? []
        : [{ path, label: route.nav.label, current: path === here }];
    });
}

// P1-175, RNF-010, RF-1105: the same groups in the same order on every page. The project group
// is always there: it names the open project, or says how to open one and has no link.
export function buildNavigation(input: NavigationInput): readonly NavGroup[] {
  const here = `/${segmentsOf(input.path).join('/')}`;
  const groups: NavGroup[] = [];
  for (const id of groupOrder) {
    if (id === 'admin' && input.role !== 'admin') continue;
    const items = itemsOf(input.routes, id, input, here);
    const label = groupLabel(id, input.project);
    const note = id === 'project' && input.project.status === 'none' ? openAProject : undefined;
    groups.push({
      id,
      ...(label === undefined ? {} : { label }),
      items,
      ...(note === undefined ? {} : { note }),
    });
  }
  return groups;
}
