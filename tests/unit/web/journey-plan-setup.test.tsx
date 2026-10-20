import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { facts, projectId, roadSigns, source } from './journey-fixtures.js';
import { savedBrief } from './plan-setup-fixtures.js';
import { base, press, ready, renderPlan } from './plan-setup-helpers.js';

// RF-615, RF-605: Plan setup shows the journey strip of the understand run it plans from, opened
// from a run (`?run=`) or from the project, and reads the facts again once the brief is saved.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const journey = `/api/projects/${projectId}/journey`;
const strip = (): HTMLElement =>
  screen.getByRole('region', { name: 'Journey from code to package' });

it('RF-615 Plan setup opened from a run shows the journey of that run', async () => {
  window.history.pushState({}, '', '/projects/p-1/plan-setup?run=run-7');
  const page = renderPlan({
    [`GET ${journey}?run=run-7`]: json(200, facts({ source: source({ id: 'run-7' }) })),
  });
  await ready();

  await screen.findByRole('region', { name: 'Journey from code to package' });

  expect(page.calls.map((call) => call.path)).toContain(`${journey}?run=run-7`);
  expect(strip().textContent).toContain('Understand');
});

it('RF-615 Plan setup opened from the project shows the journey of the project', async () => {
  const page = renderPlan({ [`GET ${journey}?run=run-1`]: json(200, roadSigns['noBrief']) });
  await ready();

  await screen.findByRole('region', { name: 'Journey from code to package' });

  expect(page.calls.map((call) => call.path)).toContain(`${journey}?run=run-1`);
});

it('RF-615 saving the brief reads the journey again, and the brief step is done', async () => {
  let reads = 0;
  const read = (): Response =>
    json(200, reads++ === 0 ? roadSigns['noBrief'] : roadSigns['estimate']);
  renderPlan({
    [`GET ${journey}?run=run-1`]: read,
    [`PUT ${base}/planning-brief`]: json(200, savedBrief),
  });
  await ready();
  await waitFor(() => {
    expect(strip().textContent).toContain('Not saved yet');
  });

  press('Save and continue');

  await waitFor(() => {
    expect(strip().textContent).toContain('Brief saved');
  });
  expect(reads).toBe(2);
});

it('RF-615 a journey that cannot be read leaves Plan setup as it is', async () => {
  renderPlan();
  await ready();

  await screen.findByText(/The journey could not be read/u);

  expect(screen.getByRole('region', { name: 'Plan estimate' })).toBeTruthy();
});

it('RST-1802 a project with no usable run asks for the journey of the project, without a run', async () => {
  const page = renderPlan({
    [`GET ${base}/plan-source`]: failure(409, 'RST-1802'),
    [`GET ${journey}`]: json(200, roadSigns['noRun']),
  });
  await ready();

  await screen.findByRole('region', { name: 'Journey from code to package' });

  expect(page.calls.map((call) => call.path)).toContain(journey);
  expect(page.calls.map((call) => call.path)).not.toContain(`${journey}?run=run-1`);
});

it('RF-615 Plan setup does not offer "Go on with the defaults" as a link to its own page (P3-68)', async () => {
  window.history.pushState({}, '', '/projects/p-1/plan-setup?run=run-1');
  renderPlan({ [`GET ${journey}?run=run-1`]: json(200, roadSigns['asking']) });
  await ready();

  await screen.findByRole('region', { name: 'Journey from code to package' });

  expect(within(strip()).getByRole('button', { name: 'Answer 2 questions' })).toBeTruthy();
  expect(within(strip()).queryByRole('button', { name: 'Go on with the defaults' })).toBeNull();
});
