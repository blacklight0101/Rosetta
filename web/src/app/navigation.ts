import { segmentsOf } from './route-match.js';
import type { NavGroupId, RouteDefinition } from './route-types.js';

// design-system.md section 3: the side navigation is built from the router table. A page listed
// there (`nav`) appears for the roles allowed to open it; the project group appears only inside a
// project and its links carry that project's id.

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

function labelOf(id: NavGroupId, projectName: string | undefined): string | undefined {
  if (id === 'admin') return 'Administration';
  if (id === 'project') return projectName === undefined ? 'Project' : `Project: ${projectName}`;
  return undefined;
}

// RNF-010, RF-1105
export function buildNavigation(input: NavigationInput): readonly NavGroup[] {
  const here = `/${segmentsOf(input.path).join('/')}`;
  const groups: NavGroup[] = [];
  for (const id of groupOrder) {
    const items = input.routes
      .filter((route) => route.nav?.group === id)
      .filter((route) => route.access !== 'admin' || input.role === 'admin')
      .toSorted((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0))
      .flatMap((route) => {
        const path = fill(route.path, {});
        return path === undefined || route.nav === undefined
          ? []
          : [{ path, label: route.nav.label, current: path === here }];
      });
    const label = labelOf(id, undefined);
    if (items.length > 0) groups.push(label === undefined ? { id, items } : { id, label, items });
  }
  return groups;
}
