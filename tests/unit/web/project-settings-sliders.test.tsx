import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { projectOf } from './project-fixtures.js';

// RF-002, DEC-116, DEC-117, P2-15: every numeric setting of the project settings page has a slider
// bounded by its DEC-117 range. The slider and the number field next to it show one value; the
// template default is marked under the slider, and a value away from the default shows a warning
// that suggests keeping it.

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

/** The slider of a limit: the range input in the same row as its number field. */
function sliderOf(label: string): HTMLInputElement {
  const slider = inputOf(label).closest('.rst-limit')?.querySelector('input[type="range"]');
  if (!(slider instanceof HTMLInputElement)) throw new Error(`${label} has no slider.`);
  return slider;
}

function type(label: string, value: string): void {
  fireEvent.input(inputOf(label), { target: { value } });
}

function slide(label: string, value: string): void {
  fireEvent.input(sliderOf(label), { target: { value } });
}

function save(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
}

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });

/** The text of everything that describes the control, as a screen reader reads it. */
const described = (element: HTMLElement): string =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

// The numeric settings of DEC-117 as the page shows them: label, min, max, step.
const bounds: readonly (readonly [string, string, string, string])[] = [
  ['Reader max output tokens', '256', '128000', '256'],
  ['Verifier max output tokens', '256', '128000', '256'],
  ['Planner max output tokens', '256', '128000', '256'],
  ['Summariser max output tokens', '256', '128000', '256'],
  ['Reader max turns', '1', '50', '1'],
  ['Run cost cap (USD)', '0', '100', '0.01'],
  ['Run token cap', '0', '50000000', '1000'],
  ['Largest file to read (bytes)', '1000', '5000000', '1000'],
  ['Area token budget', '4000', '200000', '1000'],
  ['Excerpt length (lines)', '20', '2000', '1'],
  ['Parallel readers', '1', '8', '1'],
];

it('RF-002 every numeric setting has a slider bounded by its DEC-117 range', async () => {
  renderSettings();

  await loaded();
  for (const [label, min, max, step] of bounds) {
    const slider = sliderOf(label);
    expect({ label, range: [slider.min, slider.max, slider.step] }).toEqual({
      label,
      range: [min, max, step],
    });
  }
});

it('RF-002 the confirm slider stops at the run cost cap', async () => {
  renderSettings();

  await loaded();
  expect(sliderOf('Ask before a run estimated above (USD)').max).toBe('0.5');
  type('Run cost cap (USD)', '0.30');
  expect(sliderOf('Ask before a run estimated above (USD)').max).toBe('0.3');
  type('Ask before a run estimated above (USD)', '0.4');
  expect(sliderOf('Ask before a run estimated above (USD)').value).toBe('0.3');
});

it('RF-002 a label of a number field finds that field only, not the slider beside it', async () => {
  renderSettings();
  await loaded();

  // The e2e tests find fields by a part of their label; a slider named after it would match too.
  expect(screen.getAllByLabelText('Parallel readers', { exact: true })).toHaveLength(1);
  expect(screen.getAllByLabelText('Run cost cap (USD)', { exact: true })).toHaveLength(1);
});

it('RF-002 the confirm slider never goes above its own 100 USD range', async () => {
  renderSettings();
  await loaded();

  type('Run cost cap (USD)', '150');
  expect(sliderOf('Ask before a run estimated above (USD)').max).toBe('100');
});

// RF-002, DEC-117: the confirm threshold is at most the run cost cap, kept inside its own range.
// A cap of zero is a cap (the threshold then stops at zero); text that is not a number has no cap,
// so the range's own top is the limit; a negative cap is refused by the server, and its slider
// stops at zero.
it.each([
  ['0', '0'],
  ['', '100'],
  ['abc', '100'],
  ['-1', '0'],
])('RF-002 a run cost cap of %j gives the confirm slider a top of %j', async (cap, top) => {
  renderSettings();
  await loaded();

  type('Run cost cap (USD)', cap);
  expect(sliderOf('Ask before a run estimated above (USD)').max).toBe(top);
});

it('RF-002 moving a slider sets its number field and the saved value', async () => {
  const { calls } = renderSettings({ [`PUT ${settingsRoute}`]: json(200, demo) });
  await loaded();

  slide('Parallel readers', '6');

  expect(inputOf('Parallel readers').value).toBe('6');
  save();
  await screen.findByText('Settings saved.');
  expect(calls.at(-1)?.body).toMatchObject({ agents: { parallelism: 6 } });
});

it('RF-002 a typed value beyond the range sits at the nearest end of its slider', async () => {
  renderSettings();
  await loaded();

  type('Parallel readers', '99');
  expect(sliderOf('Parallel readers').value).toBe('8');
  type('Parallel readers', 'ten');
  expect(sliderOf('Parallel readers').value).toBe('1');
});

it('RF-002 each slider marks the template default under it', async () => {
  renderSettings();
  await loaded();

  expect(screen.getByText('Default 4. Allowed 1 to 8.')).not.toBeNull();
  expect(screen.getByText('Default $0.50. Allowed $0 to $100.')).not.toBeNull();
  expect(described(sliderOf('Parallel readers'))).toContain('Default 4. Allowed 1 to 8.');
});

it('RF-002 a value away from the default shows a warning that suggests the default', async () => {
  renderSettings();
  await loaded();

  type('Parallel readers', '4');
  expect(screen.queryByText(/Differs from the default/u)).toBeNull();
  type('Parallel readers', '6');

  const warning = screen.getByText(
    'Differs from the default of 4. Keep the default unless you have a reason to change it.',
  );
  expect(described(sliderOf('Parallel readers'))).toContain(warning.textContent);
  await waitFor(() => {
    expect(sliderOf('Parallel readers').value).toBe('6');
  });
});

// RF-002, P2-26: each slider is named by an aria-label built from its field label, so a lookup by
// the field label (exact) still finds the number field only, and no tooltip (title) stands in.
it('RF-002 each slider is named by its field label, with no title, and a label lookup finds one control', async () => {
  renderSettings();
  await loaded();

  for (const [label] of bounds) {
    const slider = sliderOf(label);
    expect({ label, title: slider.getAttribute('title') }).toEqual({ label, title: null });
    expect({ label, name: slider.getAttribute('aria-label') }).toEqual({
      label,
      name: `${label} slider`,
    });
    expect(screen.getAllByLabelText(label, { exact: true })).toHaveLength(1);
  }
});

// RF-002, P2-26: a typed value outside the range is named inline, before Save, with its range.
it('RF-002 a typed value below or above the range shows an inline hint before Save', async () => {
  renderSettings();
  await loaded();

  type('Parallel readers', '99');
  expect(
    screen.getByText('99 is outside the allowed range of 1 to 8. Save will refuse it.'),
  ).not.toBeNull();
  expect(described(sliderOf('Parallel readers'))).toContain(
    '99 is outside the allowed range of 1 to 8.',
  );

  type('Parallel readers', '0');
  expect(
    screen.getByText('0 is outside the allowed range of 1 to 8. Save will refuse it.'),
  ).not.toBeNull();
});

it('RF-002 a value inside the range shows no range hint', async () => {
  renderSettings();
  await loaded();

  type('Parallel readers', '8');

  expect(screen.queryByText(/is outside the allowed range/u)).toBeNull();
});

it('RF-002 a confirm threshold above its slider top shows the hint in dollars', async () => {
  renderSettings();
  await loaded();

  type('Run cost cap (USD)', '0.30');
  type('Ask before a run estimated above (USD)', '0.4');

  expect(
    screen.getByText('$0.40 is outside the allowed range of $0.00 to $0.30. Save will refuse it.'),
  ).not.toBeNull();
});

// RF-002, P2-26: the out-of-range hint is linked from the number field too, and is a polite live region.
it('RF-002 the out-of-range hint is linked from the number field and announced politely', async () => {
  renderSettings();
  await loaded();

  type('Parallel readers', '99');

  const hint = screen.getByText('99 is outside the allowed range of 1 to 8. Save will refuse it.');
  expect(hint.getAttribute('role')).toBe('status');
  expect(described(inputOf('Parallel readers'))).toContain(
    '99 is outside the allowed range of 1 to 8.',
  );
});

// RF-002, P2-26: every slider on the page has its own name, also with the run cap at 100.
it('RF-002 every slider on the settings page has a different name, also with the run cap at 100', async () => {
  renderSettings();
  await loaded();
  type('Run cost cap (USD)', '100');

  const names = screen.getAllByRole('slider').map((slider) => slider.getAttribute('aria-label'));

  expect(names).toHaveLength(12);
  expect(new Set(names).size).toBe(names.length);
});

// RF-002, P2-29: while the run cost cap is out of its range, the confirm field shows no range hint.
it('RF-002 the confirm field shows no range hint while the run cost cap is invalid', async () => {
  renderSettings();
  await loaded();

  type('Run cost cap (USD)', '-1');

  expect(screen.queryByText(/\$0\.25 is outside/u)).toBeNull();
  expect(described(inputOf('Ask before a run estimated above (USD)'))).not.toContain('is outside');
  expect(described(sliderOf('Ask before a run estimated above (USD)'))).not.toContain('is outside');
});

// RF-002, P2-29: a run cap above its maximum hides the confirm hint; a cap at zero (the minimum) keeps it.
it('RF-002 a run cost cap above its maximum hides the confirm hint', async () => {
  renderSettings();
  await loaded();
  type('Run cost cap (USD)', '150');
  type('Ask before a run estimated above (USD)', '150');
  expect(described(inputOf('Ask before a run estimated above (USD)'))).not.toContain('is outside');
});

it('RF-002 a run cost cap exactly at its minimum keeps the confirm hint', async () => {
  renderSettings();
  await loaded();
  type('Run cost cap (USD)', '0');
  type('Ask before a run estimated above (USD)', '0.4');
  expect(described(inputOf('Ask before a run estimated above (USD)'))).toContain('is outside');
});

// RF-002, P2-26: the bottom of the range is inside it, so exactly the minimum shows no hint.
it('RF-002 a value exactly at the minimum of its range shows no hint', async () => {
  renderSettings();
  await loaded();

  type('Parallel readers', '1');

  expect(screen.queryByText(/is outside the allowed range/u)).toBeNull();
});
