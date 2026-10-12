import { GalleryPage } from '../gallery/GalleryPage.js';
import { ChangePasswordPage } from '../pages/ChangePasswordPage.js';
import { ProjectSettingsPage } from '../pages/ProjectSettingsPage.js';
import { ProjectsPage } from '../pages/ProjectsPage.js';
import { SettingsPage } from '../pages/SettingsPage.js';
import { SignInPage } from '../pages/SignInPage.js';
import { HomePage } from './HomePage.js';
import type { RouteDefinition } from './route-types.js';

// The router table. Each page card adds its rows here (landing page, sign-in, projects, ...); a row
// with `nav` also appears in the side navigation. Unlisted paths show the not-found page.
// `/` and `/sign-in` are the only pages the server serves without a session (P1-09).

/** The component gallery exists only in the development server (design-system.md section 5). */
const developmentRoutes: readonly RouteDefinition[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/gallery',
        title: 'Component gallery',
        access: 'public',
        chrome: 'bare',
        component: GalleryPage,
      },
    ]
  : [];

export const routes: readonly RouteDefinition[] = [
  // Replaced by the landing page of P1-15.
  { path: '/', title: 'Rosetta', access: 'public', chrome: 'bare', component: HomePage },
  { path: '/sign-in', title: 'Sign in', access: 'public', chrome: 'bare', component: SignInPage },
  {
    path: '/account/password',
    title: 'Change password',
    access: 'user',
    chrome: 'bare',
    component: ChangePasswordPage,
  },
  {
    path: '/projects',
    title: 'Projects',
    access: 'user',
    chrome: 'shell',
    component: ProjectsPage,
    nav: { group: 'main', label: 'Projects', order: 10 },
  },
  {
    path: '/projects/:projectId/settings',
    title: 'Project settings',
    access: 'user',
    chrome: 'shell',
    component: ProjectSettingsPage,
    nav: { group: 'project', label: 'Project settings', order: 90 },
  },
  {
    path: '/settings',
    title: 'Settings and keys',
    access: 'user',
    chrome: 'shell',
    component: SettingsPage,
    nav: { group: 'main', label: 'Settings and keys', order: 90 },
  },
  ...developmentRoutes,
];
