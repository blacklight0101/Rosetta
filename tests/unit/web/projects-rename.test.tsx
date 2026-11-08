import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { lastRunOf, overviewRow, projectOf } from './project-fixtures.js';

// RF-010, P8-134, DEC-222, `P8Projects` artboard: "Rename" in the row menu of the projects list opens
// the confirmation dialog of the design system with a "Project name" field holding the current name;
// saving sends `PUT /api/projects/:id/name`, closes the dialog and reads the list again, so the row
// shows the new name; a refusal is shown next to the field with its code; Cancel and Escape change
// nothing and give the focus back to the menu button.

const overviewPath = 'GET /api/projects/overview';
const renamePath = 'PUT /api/projects/p-1/name';
const github = projectOf('p-1', 'octo/webforms');

const rows = (list: readonly Record<string, unknown>[]): Response =>
  json(200, { projects: list, truncated: false });

const renderProjects = (answers: Readonly<Record<string, Answer>>) =>
  renderPage(<ProjectsPage />, answers);

async function openRename(name = 'octo/webforms'): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name: `More actions for ${name}` });
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
  return screen.findByRole('dialog', { name: `Rename project ${name}` });
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-010 Rename opens a dialog whose Project name field holds the current name, and saving shows the new name in the list', async () => {
  let name = 'octo/webforms';
  const { calls } = renderProjects({
    [overviewPath]: () => rows([overviewRow({ ...github, name })]),
    [renamePath]: () => {
      name = 'Order Desk';
      return json(200, { ...github, name });
    },
  });

  const dialog = await openRename();
  const field = within(dialog).getByLabelText('Project name');
  expect(field).toHaveProperty('value', 'octo/webforms');
  expect(calls.some((call) => call.method === 'PUT')).toBe(false);

  fireEvent.input(field, { target: { value: 'Order Desk' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

  await screen.findByRole('link', { name: 'Order Desk', exact: true });
  expect(screen.queryByRole('dialog')).toBeNull();
  const put = calls.find((call) => call.method === 'PUT');
  expect(put).toMatchObject({ path: '/api/projects/p-1/name', body: { name: 'Order Desk' } });
  expect(put?.csrf).not.toBeNull();
  expect(screen.queryByRole('link', { name: 'octo/webforms', exact: true })).toBeNull();
});

it('RF-010 Enter in the Project name field saves the new name', async () => {
  const { calls } = renderProjects({
    [overviewPath]: rows([overviewRow(github)]),
    [renamePath]: json(200, { ...github, name: 'Order Desk' }),
  });
  const dialog = await openRename();
  const field = within(dialog).getByLabelText('Project name');
  fireEvent.input(field, { target: { value: 'Order Desk' } });

  fireEvent.submit(field.closest('form') ?? document.body);

  await waitFor(() => {
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ name: 'Order Desk' });
  });
});

it('RF-010 a refused name is shown next to the field with its code, and the dialog stays open', async () => {
  renderProjects({
    [overviewPath]: rows([overviewRow(github)]),
    [renamePath]: failure(400, 'RST-2000'),
  });
  const dialog = await openRename();
  const field = within(dialog).getByLabelText('Project name');
  fireEvent.input(field, { target: { value: '   ' } });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

  const error = await within(dialog).findByTestId('field-error');
  expect(error.textContent).toContain('RST-2000');
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('dialog', { name: 'Rename project octo/webforms' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'octo/webforms', exact: true })).toBeTruthy();
});

it.each([
  [
    'Cancel',
    (dialog: HTMLElement) =>
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })),
  ],
  ['Escape', (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: 'Escape' })],
])(
  'RF-010 %s closes the rename dialog, renames nothing and returns the focus to the menu button',
  async (_how, close) => {
    const { calls } = renderProjects({ [overviewPath]: rows([overviewRow(github)]) });
    const button = await screen.findByRole('button', { name: 'More actions for octo/webforms' });
    const dialog = await openRename();
    fireEvent.input(within(dialog).getByLabelText('Project name'), { target: { value: 'Other' } });

    close(dialog);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(button);
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  },
);

it('RF-010 Rename is offered while a run of the project is running', async () => {
  renderProjects({
    [overviewPath]: rows([
      overviewRow(github, {
        runs: 1,
        lastRun: lastRunOf({ queueState: 'Running', endState: null, endedAt: null }),
      }),
    ]),
  });
  fireEvent.click(await screen.findByRole('button', { name: 'More actions for octo/webforms' }));

  const item = screen.getByRole('menuitem', { name: 'Rename' });

  expect(item.getAttribute('aria-disabled')).toBeNull();
  expect(screen.getAllByRole('menuitem')[0]).toBe(item);
});
