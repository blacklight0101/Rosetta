import type { ComponentType } from 'preact';

// P1-12: what one row of the router table (`routes.ts`) says about a page.

/** Who may open the page: anyone, a signed-in user, or an administrator (RF-1009, RF-1102). */
type RouteAccess = 'public' | 'user' | 'admin';

/** The navigation groups of the shell (design-system.md section 3 and the hosted artboards). */
export type NavGroupId = 'main' | 'project' | 'admin';

interface NavEntry {
  readonly group: NavGroupId;
  readonly label: string;
  /** Position inside the group, ascending. */
  readonly order: number;
}

export interface RouteDefinition {
  /** Literal segments and `:name` parameters, for example `/projects/:projectId/runs/new`. */
  readonly path: string;
  /** The page title; the document title is `<title> - Rosetta`. */
  readonly title: string;
  readonly access: RouteAccess;
  /** `shell` pages show the signed-in header and navigation; `bare` pages draw their own page. */
  readonly chrome: 'shell' | 'bare';
  readonly component: ComponentType;
  /** Present when the page is listed in the side navigation. */
  readonly nav?: NavEntry;
}
