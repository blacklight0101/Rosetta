import { GalleryPage } from '../gallery/GalleryPage.js';
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
  ...developmentRoutes,
];
