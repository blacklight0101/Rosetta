import { screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage } from './fake-api.js';
import { projectOf } from './project-fixtures.js';

// P5-06: the cap warning links to /projects/:id/settings#caps. Once the settings page has loaded,
// the browser must bring the caps section to the top, as a plain page load would.

const route = '/api/projects/p-1';

interface ScrollWatch {
  readonly ids: string[];
  readonly before: PropertyDescriptor | undefined;
}

let watch: ScrollWatch | undefined;

afterEach(() => {
  if (watch !== undefined) {
    if (watch.before === undefined) Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    else Object.defineProperty(Element.prototype, 'scrollIntoView', watch.before);
  }
  watch = undefined;
  window.location.hash = '';
});

function watchScroll(): string[] {
  const ids: string[] = [];
  const before = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  watch = { ids, before };
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: function scrollIntoView(this: Element): void {
      ids.push(this.id);
    },
  });
  return ids;
}

it('P5-06 the settings page scrolls the caps section into view when the link names it', async () => {
  const scrolled = watchScroll();
  window.location.hash = '#caps';

  renderPage(
    <ProjectSettingsPage />,
    { [`GET ${route}`]: json(200, projectOf('p-1', 'octo/demo')) },
    undefined,
    { projectId: 'p-1' },
  );
  await screen.findByRole('heading', { name: 'Project settings' });

  await waitFor(() => {
    expect(scrolled).toContain('caps');
  });
});

it('P5-06 the settings page does not scroll anywhere without a fragment', async () => {
  const scrolled = watchScroll();
  window.location.hash = '';

  renderPage(
    <ProjectSettingsPage />,
    { [`GET ${route}`]: json(200, projectOf('p-1', 'octo/demo')) },
    undefined,
    { projectId: 'p-1' },
  );
  await screen.findByRole('heading', { name: 'Project settings' });

  expect(scrolled).toEqual([]);
});
