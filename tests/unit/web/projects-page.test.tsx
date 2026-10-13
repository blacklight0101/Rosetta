import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { overviewRow, projectOf } from './project-fixtures.js';

// RF-010, RF-1105, design-system.md section 14 (Projects): the user's projects, the New project
// form with the refusal next to the field, and the existing project that opens when the same URL
// is created again. The run columns and the queue notice are in projects-runs.test.tsx.

const demoUrl = 'https://github.com/octo/demo';
const demo = projectOf('p-1', 'octo/demo', { ref: 'main', subpath: 'src/legacy' });
const other = projectOf('p-2', 'acme/shop');

const renderProjects = (answers: Readonly<Record<string, Answer>>) =>
  renderPage(<ProjectsPage />, answers);

function urlField(): HTMLInputElement {
  const field = screen.getByLabelText('GitHub repository URL');
  if (!(field instanceof HTMLInputElement)) throw new Error('The URL field is not an input.');
  return field;
}

/** The text of everything that describes the control, as a screen reader reads it. */
function describedText(element: HTMLElement): string {
  const ids = (element.getAttribute('aria-describedby') ?? '').split(' ');
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

function create(url: string): void {
  fireEvent.input(urlField(), { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-010 lists the projects with branch, folder and a link to their settings', async () => {
  renderProjects({
    'GET /api/projects/overview': json(200, { projects: [demo, other].map((p) => overviewRow(p)) }),
  });

  const row = (await screen.findByText('octo/demo')).closest('tr');
  if (row === null) throw new Error('No row for octo/demo.');

  expect(within(row).getByText('main')).not.toBeNull();
  expect(within(row).getByText('src/legacy')).not.toBeNull();
  expect(
    within(row).getByRole('link', { name: 'Settings for octo/demo' }).getAttribute('href'),
  ).toBe('/projects/p-1/settings');
  expect(
    within(row).getByRole('link', { name: 'Start run for octo/demo' }).getAttribute('href'),
  ).toBe('/projects/p-1/start');
  const second = screen.getByText('acme/shop').closest('tr');
  expect(within(second ?? row).getByText('default branch')).not.toBeNull();
  expect(within(second ?? row).getByText('whole repository')).not.toBeNull();
});

it('RF-010 with no project says so and offers the demo repository', async () => {
  renderProjects({ 'GET /api/projects/overview': json(200, { projects: [] }) });

  await screen.findByText(/No projects yet/u);
  fireEvent.click(screen.getByRole('button', { name: 'Use the demo repository' }));

  expect(urlField().value).toBe(
    'https://github.com/dotnet-architecture/eShopModernizing/tree/master/eShopLegacyWebFormsSolution',
  );
  expect(screen.queryByRole('table')).toBeNull();
});

it('RF-1105 a list that cannot be loaded shows the error and still offers the form', async () => {
  renderProjects({ 'GET /api/projects/overview': failure(500, 'RST-2006') });

  expect((await screen.findByRole('alert')).textContent).toContain('RST-2006');
  expect(screen.getByRole('button', { name: 'Create project' })).not.toBeNull();
});

it('RF-010 creates a project from the URL with the CSRF token and lists it', async () => {
  const { calls } = renderProjects({
    'GET /api/projects/overview': json(200, { projects: [overviewRow(other)] }),
    'POST /api/projects': json(201, demo),
  });
  await screen.findByText('acme/shop');

  create(demoUrl);

  await screen.findByText('octo/demo');
  expect(calls.at(-1)).toEqual({
    method: 'POST',
    path: '/api/projects',
    csrf: 'csrf-0',
    body: { url: demoUrl },
  });
  expect(screen.getByRole('status').textContent).toContain('Created octo/demo');
  expect(urlField().value).toBe('');
  expect(screen.getAllByRole('row')).toHaveLength(3);
});

it('RF-010 the same URL again opens the existing project and adds nothing', async () => {
  renderProjects({
    'GET /api/projects/overview': json(200, { projects: [overviewRow(demo)] }),
    'POST /api/projects': json(200, demo),
  });
  await screen.findByText('octo/demo');

  create(demoUrl);

  await waitFor(() => {
    expect(window.location.pathname).toBe('/projects/p-1/start');
  });
  expect(screen.getAllByRole('row')).toHaveLength(2);
});

it('RF-010 a URL that is not a GitHub repository is refused next to the field and nothing is added', async () => {
  renderProjects({
    'GET /api/projects/overview': json(200, { projects: [overviewRow(other)] }),
    'POST /api/projects': json(400, {
      code: 'RST-1900',
      message: 'The address is not a public GitHub repository URL.',
      nextStep: 'Use https://github.com/<owner>/<repo>.',
      problems: [
        {
          field: 'url',
          code: 'RST-1900',
          message: 'The address is not a public GitHub repository URL.',
          nextStep: 'Use https://github.com/<owner>/<repo>.',
          reason: 'The address is not on github.com.',
        },
      ],
    }),
  });
  await screen.findByText('acme/shop');

  create('https://example.com/octo/demo');

  await waitFor(() => {
    expect(document.activeElement).toBe(urlField());
  });
  expect(urlField().getAttribute('aria-invalid')).toBe('true');
  const message = describedText(urlField());
  expect(message).toContain('RST-1900');
  expect(message).toContain('The address is not on github.com.');
  expect(urlField().value).toBe('https://example.com/octo/demo');
  expect(screen.getAllByRole('row')).toHaveLength(2);
  expect(window.location.pathname).toBe('/');
});

it('RNF-010 a refusal read through the focused field is not also announced as an alert', async () => {
  renderProjects({
    'GET /api/projects/overview': json(200, { projects: [] }),
    'POST /api/projects': failure(400, 'RST-1900', [{ field: 'url', code: 'RST-1900' }]),
  });
  await screen.findByText(/No projects yet/u);

  create('nope');

  await waitFor(() => {
    expect(urlField().getAttribute('aria-invalid')).toBe('true');
  });
  expect(screen.queryAllByRole('alert')).toEqual([]);
});

it('RF-010 a refusal that names no field shows in a banner', async () => {
  renderProjects({
    'GET /api/projects/overview': json(200, { projects: [] }),
    'POST /api/projects': failure(429, 'RST-2005'),
  });
  await screen.findByText(/No projects yet/u);

  create(demoUrl);

  expect((await screen.findByRole('alert')).textContent).toContain('RST-2005');
});
