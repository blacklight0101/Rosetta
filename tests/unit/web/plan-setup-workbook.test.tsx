import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { base, press, ready, renderPlan, saves, stepName } from './plan-setup-helpers.js';
import { projectOf } from './project-fixtures.js';

// RF-648, RF-649, RF-650, RF-645, DEC-150: the three questions of a project of workbooks on the
// project-context step; a project of any other source is not asked.

const workbookProject = projectOf('p-1', 'Sheets', { sourceKind: 'workbook', sourceUrl: '' });
const asWorkbook = { [`GET ${base}`]: json(200, workbookProject) };

const SIGN_IN = 'How will people sign in to the new application?';
const SECRETS = 'Where will the new application keep its secrets?';
const SCREENS = 'Should each register get screens?';

async function openContext(): Promise<void> {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Project context' }));
  await waitFor(() => {
    expect(stepName()).toBe('Project context');
  });
}

const titles = (group: HTMLElement): (string | undefined)[] =>
  within(group)
    .getAllByRole<HTMLInputElement>('radio')
    .map((radio) => radio.labels?.[0]?.textContent ?? undefined);

describe('the workbook questions', () => {
  it('RF-648 RF-649 RF-650 a workbook project is asked three questions, the recommended option first', async () => {
    renderPlan(asWorkbook);
    await openContext();

    expect(titles(screen.getByRole('radiogroup', { name: SIGN_IN }))).toEqual([
      'Single sign-on (Recommended)',
      'Windows authentication',
      'Accounts of the application',
      'Type your own answer',
    ]);
    expect(titles(screen.getByRole('radiogroup', { name: SECRETS }))[0]).toBe(
      'The secret store of the hosting platform (Recommended)',
    );
    expect(titles(screen.getByRole('radiogroup', { name: SCREENS }))[0]).toBe(
      'List, edit and search screens (Recommended)',
    );
  });

  it('RF-648 the recommended sign-in follows the hosting answer of the stack', async () => {
    const page = renderPlan(asWorkbook);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Stack' }));
    fireEvent.input(await screen.findByLabelText(/Your own answer.*Hosting/iu), {
      target: { value: 'IIS on Windows Server' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Project context' }));

    const group = await screen.findByRole('radiogroup', { name: SIGN_IN });
    expect(titles(group)[0]).toBe('Windows authentication (Recommended)');
    expect(page.calls.length).toBeGreaterThan(0);
  });

  it('RF-648 a project of a repository is not asked', async () => {
    renderPlan();
    await openContext();

    expect(screen.queryByRole('radiogroup', { name: SIGN_IN })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: SECRETS })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: SCREENS })).toBeNull();
  });
});

describe('the workbook questions: saves', () => {
  it('RF-645 a chosen option is saved in chosen, and a question left alone sends nothing', async () => {
    const page = renderPlan(asWorkbook);
    await openContext();

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: SIGN_IN })).getByRole('radio', {
        name: 'Accounts of the application',
      }),
    );
    press('Save and continue');

    await screen.findByRole('heading', { name: /Will agents or people build/u, level: 2 });
    expect(saves(page)).toEqual([{ chosen: { 'workbook.signIn': 'accounts' } }]);
  });

  it('RF-645 a typed answer is saved as typed text', async () => {
    const page = renderPlan(asWorkbook);
    await openContext();

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: SECRETS })).getByRole('radio', {
        name: 'Type your own answer',
      }),
    );
    fireEvent.input(screen.getByLabelText('Your own answer for secrets'), {
      target: { value: 'The team key vault' },
    });
    press('Save and continue');

    await screen.findByRole('heading', { name: /Will agents or people build/u, level: 2 });
    expect(saves(page)).toEqual([
      {
        chosen: { 'workbook.secrets': 'typed' },
        typed: { 'workbook.secrets': 'The team key vault' },
      },
    ]);
  });
});
