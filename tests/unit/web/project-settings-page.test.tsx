import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-002, RF-010, DEC-116, DEC-117, design-system.md section 14: the settings page of one project.
// The numbers are plain number fields (the sliders are card P2-15); the server decides what is
// allowed and each of its refusals shows next to its field with the code.

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;
const demo = projectOf('p-1', 'octo/demo');

const renderSettings = (answers: Readonly<Record<string, Answer>> = {}) =>
  renderPage(
    <ProjectSettingsPage />,
    { [`GET ${route}`]: json(200, demo), ...answers },
    undefined,
    { projectId: 'p-1' },
  );

function inputOf(label: string): HTMLInputElement {
  const field = screen.getByLabelText(label);
  if (!(field instanceof HTMLInputElement)) throw new Error(`${label} is not an input.`);
  return field;
}

function type(label: string, value: string): void {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

function save(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
}

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });

const described = (element: HTMLElement): string =>
  document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent ?? '';

describe('the form', () => {
  it('DEC-116 shows the project and the settings as built, caps in dollars', async () => {
    renderSettings();

    await loaded();
    expect(screen.getByText('octo/demo')).not.toBeNull();
    expect(inputOf('Reader model').value).toBe('gemma4:e4b');
    expect(inputOf('Reader max output tokens').value).toBe('4096');
    expect(inputOf('Reader max turns').value).toBe('12');
    expect(inputOf('Run cost cap (USD)').value).toBe('0.50');
    expect(inputOf('Run token cap').value).toBe('2000000');
    expect(inputOf('Ask before a run estimated above (USD)').value).toBe('0.25');
    expect(inputOf('Largest file to read (bytes)').value).toBe('1000000');
    expect(inputOf('Parallel readers').value).toBe('1');
    expect(screen.getByLabelText('Ignore rules').textContent).toBe('node_modules/\nbin/\nobj/\n');
  });

  it('RF-405 only the reader has a turn limit', async () => {
    renderSettings();

    await loaded();
    expect(screen.queryByLabelText('Verifier max turns')).toBeNull();
    expect(screen.getAllByLabelText(/ max output tokens$/u)).toHaveLength(4);
  });

  it('RF-1105 a project that cannot be loaded shows the error and no form', async () => {
    renderSettings({ [`GET ${route}`]: failure(404, 'RST-2003') });

    expect((await screen.findByRole('alert')).textContent).toContain('RST-2003');
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
  });
});

describe('saving', () => {
  it('RF-002 saves the edited document whole, with the CSRF token, and says so', async () => {
    const { calls } = renderSettings({ [`PUT ${settingsRoute}`]: json(200, demo) });
    await loaded();

    type('Reader model', 'gemma4:e2b');
    type('Run cost cap (USD)', '1.25');
    type('Run token cap', '3000000');
    fireEvent.click(screen.getByLabelText('Allow models missing from the price table'));
    type('Ignore rules', 'vendor/\n');
    save();

    await screen.findByText('Settings saved.');
    const expected = templateSettings();
    expected.roles.reader.model = 'gemma4:e2b';
    expected.budget.run = { maxCostMicros: 1_250_000, maxTokens: 3_000_000 };
    expected.budget.allowUnpriced = true;
    expected.scan.ignoreRules = 'vendor/\n';
    expect(calls.at(-1)).toEqual({
      method: 'PUT',
      path: settingsRoute,
      csrf: 'csrf-0',
      body: expected,
    });
  });

  it('RF-002 a role on a provider the project does not define brings that provider with it', async () => {
    const { calls } = renderSettings({ [`PUT ${settingsRoute}`]: json(200, demo) });
    await loaded();

    fireEvent.change(screen.getByLabelText('Planner provider'), { target: { value: 'openai' } });
    type('Planner model', 'gpt-5-mini');
    save();

    await screen.findByText('Settings saved.');
    expect(calls.at(-1)?.body).toMatchObject({
      providers: {
        ollama: { kind: 'ollama' },
        openai: { kind: 'openai', keySource: 'user-then-server', timeoutSeconds: 120 },
      },
      roles: { planner: { provider: 'openai', model: 'gpt-5-mini', maxOutputTokens: 4096 } },
    });
  });

  it('RF-002 keeps the settings the form has no field for', async () => {
    const withRoleCaps = projectOf('p-1', 'octo/demo', {
      settings: {
        ...templateSettings(),
        budget: { ...templateSettings().budget, roles: { reader: { maxTokens: 900_000 } } },
      },
    });
    const { calls } = renderSettings({
      [`GET ${route}`]: json(200, withRoleCaps),
      [`PUT ${settingsRoute}`]: json(200, withRoleCaps),
    });
    await loaded();

    save();

    await screen.findByText('Settings saved.');
    expect(calls.at(-1)?.body).toMatchObject({
      budget: { roles: { reader: { maxTokens: 900_000 } } },
    });
  });
});

describe('refusals', () => {
  it('RF-002 shows each refusal of the server next to its field with the code and focuses the first', async () => {
    renderSettings({
      [`PUT ${settingsRoute}`]: failure(400, 'RST-1005', [
        { field: 'roles.reader.model', code: 'RST-1002' },
        { field: 'budget.run.maxTokens', code: 'RST-1003' },
      ]),
    });
    await loaded();
    type('Reader model', '');
    type('Run token cap', '-1');

    save();

    const model = screen.getByLabelText('Reader model');
    await waitFor(() => {
      expect(document.activeElement).toBe(model);
    });
    expect(model.getAttribute('aria-invalid')).toBe('true');
    expect(described(model)).toContain('RST-1002');
    expect(described(screen.getByLabelText('Run token cap'))).toContain('RST-1003');
    expect(screen.queryByText('Settings saved.')).toBeNull();
    expect(screen.queryAllByRole('alert')).toEqual([]);
  });

  it('RF-002 a refusal for a setting the page does not show goes to a banner that names it', async () => {
    renderSettings({
      [`PUT ${settingsRoute}`]: failure(400, 'RST-1005', [
        { field: 'output.transcripts', code: 'RST-1006' },
      ]),
    });
    await loaded();

    save();

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('output.transcripts');
    expect(banner.textContent).toContain('RST-1006');
  });

  it('RF-002 a number that is not a whole number is refused next to the field and nothing is sent', async () => {
    const { calls } = renderSettings();
    await loaded();
    type('Run token cap', '1.5');
    type('Run cost cap (USD)', 'ten');

    save();

    await waitFor(() => {
      expect(inputOf('Run token cap').getAttribute('aria-invalid')).toBe('true');
    });
    expect(inputOf('Run cost cap (USD)').getAttribute('aria-invalid')).toBe('true');
    expect(calls.filter((call) => call.method === 'PUT')).toEqual([]);
  });

  it('RF-002 a refused save keeps what was typed so it can be fixed', async () => {
    renderSettings({
      [`PUT ${settingsRoute}`]: failure(400, 'RST-1005', [
        { field: 'agents.parallelism', code: 'RST-1006' },
      ]),
    });
    await loaded();
    type('Parallel readers', '99');

    save();

    await waitFor(() => {
      expect(inputOf('Parallel readers').getAttribute('aria-invalid')).toBe('true');
    });
    expect(inputOf('Parallel readers').value).toBe('99');
  });
});

describe('price overrides', () => {
  it('DEC-107 adds an override in dollars per million tokens, saves it and removes it', async () => {
    const { calls } = renderSettings({ [`PUT ${settingsRoute}`]: json(200, demo) });
    await loaded();
    expect(screen.getByText(/No price overrides/u)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add price override' }));
    fireEvent.change(screen.getByLabelText('Override 1 provider'), { target: { value: 'openai' } });
    type('Override 1 model', 'gpt-5-mini');
    type('Override 1 input (USD per million tokens)', '0.25');
    type('Override 1 output (USD per million tokens)', '2');
    type('Override 1 cached input (USD per million tokens)', '0.025');
    save();

    await screen.findByText('Settings saved.');
    expect(calls.at(-1)?.body).toMatchObject({
      budget: {
        prices: [
          {
            provider: 'openai',
            model: 'gpt-5-mini',
            inputPerMillionMicros: 250_000,
            outputPerMillionMicros: 2_000_000,
            cachedInputPerMillionMicros: 25_000,
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove override 1' }));
    save();
    await waitFor(() => {
      expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(2);
    });
    expect(JSON.stringify(calls.at(-1)?.body)).not.toContain('"prices"');
  });

  it('RF-002 shows a refusal of one override next to its field', async () => {
    renderSettings({
      [`PUT ${settingsRoute}`]: failure(400, 'RST-1005', [
        { field: 'budget.prices.0.model', code: 'RST-1006' },
      ]),
    });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Add price override' }));
    type('Override 1 input (USD per million tokens)', '1');
    type('Override 1 output (USD per million tokens)', '1');
    type('Override 1 cached input (USD per million tokens)', '0');

    save();

    await waitFor(() => {
      expect(screen.getByLabelText('Override 1 model').getAttribute('aria-invalid')).toBe('true');
    });
  });
});
