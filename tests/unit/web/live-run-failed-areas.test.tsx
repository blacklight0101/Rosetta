import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failedAreasOf } from '../../../web/src/lib/live-run/run-summary.js';
import { failure, json } from './fake-api.js';
import {
  agentEnded,
  cardProposed,
  ev,
  planned,
  runEnded,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';
import { renderLive } from './live-run-helpers.js';

// RF-208, RF-1002: a run in which some areas gave no usable card is never shown as a plain success;
// the page says how many failed and why, and offers Retry failed areas: a new run of those areas.

afterEach(() => {
  vi.unstubAllGlobals();
});

const startPath = '/api/projects/p-1/runs';
const retryBody = { stage: 'understand', areas: ['Catalog'], cloudConsent: false };
const started = json(202, {
  id: 'run-2',
  runId: '20261012-110000-understand',
  stage: 'understand',
  queueState: 'Queued',
  position: null,
});

const twoAreas = [
  ev(1, 'run.started', startedData),
  planned(2, 'reader-001', 'Catalog'),
  planned(3, 'reader-002', 'Services'),
  agentEnded(4, 'reader-001', 'InvalidOutput'),
  cardProposed(5, 'reader-002', 'FEAT-001'),
  agentEnded(6, 'reader-002', 'Done', 1),
] as const;

it('RF-208 failedAreasOf lists the areas whose agent ended without a card, with why', () => {
  const state = stateAfter(
    ...twoAreas,
    planned(7, 'reader-003', 'Models'),
    agentEnded(8, 'reader-003', 'TurnLimitReached'),
    planned(9, 'reader-004', 'Setup'),
    cardProposed(10, 'reader-004', 'FEAT-002'),
    agentEnded(11, 'reader-004', 'TurnLimitReached', 1),
  );

  expect(failedAreasOf(state)).toEqual([
    { area: 'Catalog', why: 'invalid output' },
    { area: 'Models', why: 'turn limit reached without a card' },
  ]);
});

it('RF-208 the ended event keeps the number of failed areas', () => {
  const state = stateAfter(...twoAreas, runEnded(7, 'Completed', undefined, 1));

  expect(state.ended).toMatchObject({ endState: 'Completed', failedAreas: 1 });
});

it('RF-208 a completed run with a failed area says so and names the area and why', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  for (const event of twoAreas) connection.event(event);
  connection.event(runEnded(7, 'Completed', undefined, 1));

  const banner = await screen.findByTestId('failed-areas');
  expect(banner.textContent).toContain('Completed with 1 area failed');
  expect(within(banner).getByText('Catalog: invalid output')).toBeTruthy();
  expect(within(banner).queryByText(/Services/u)).toBeNull();
  expect(within(banner).getByRole('button', { name: 'Retry failed areas' })).toBeTruthy();
});

it('RF-208 a run with several failed areas counts them', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(planned(1, 'reader-001', 'Catalog'));
  connection.event(planned(2, 'reader-002', 'Services'));
  connection.event(agentEnded(3, 'reader-001', 'InvalidOutput'));
  connection.event(agentEnded(4, 'reader-002', 'Failed'));
  connection.event(runEnded(5, 'Completed', undefined, 2));

  const banner = await screen.findByTestId('failed-areas');
  expect(banner.textContent).toContain('Completed with 2 areas failed');
});

it('RF-208 a run in which every area failed says how many failed next to its Failed state', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(planned(1, 'reader-001', 'Catalog'));
  connection.event(agentEnded(2, 'reader-001', 'InvalidOutput'));
  connection.event(runEnded(3, 'Failed', 'RST-1300'));

  const banner = await screen.findByTestId('failed-areas');
  expect(banner.textContent).toContain('1 area failed');
  expect(banner.textContent).not.toContain('Completed');
});

it('RF-208 a run without failed areas shows no failed-areas notice', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(planned(1, 'reader-001', 'Catalog'));
  connection.event(cardProposed(2, 'reader-001', 'FEAT-001'));
  connection.event(agentEnded(3, 'reader-001', 'Done', 1));
  connection.event(runEnded(4, 'Completed'));

  await waitFor(() => {
    expect(screen.getByTestId('run-status').textContent).toContain('Completed');
  });
  expect(screen.queryByTestId('failed-areas')).toBeNull();
});

it('RF-208 a stopped run shows no failed-areas notice, because stopped tasks are not failed areas', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(planned(1, 'reader-001', 'Catalog'));
  connection.event(agentEnded(2, 'reader-001', 'Failed'));
  connection.event(runEnded(3, 'Interrupted'));

  await waitFor(() => {
    expect(screen.getByTestId('run-status').textContent).toContain('Interrupted');
  });
  expect(screen.queryByTestId('failed-areas')).toBeNull();
});

it('RF-208 the notice waits for the end of the run', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(planned(1, 'reader-001', 'Catalog'));
  connection.event(agentEnded(2, 'reader-001', 'InvalidOutput'));

  await waitFor(() => {
    expect(screen.getAllByText('Catalog').length).toBeGreaterThan(0);
  });
  expect(screen.queryByTestId('failed-areas')).toBeNull();
});

it('RF-208 Retry failed areas starts a new run of the failed areas only and opens it', async () => {
  const { stream, calls } = renderLive({ [`POST ${startPath}`]: started });
  const connection = await stream.connection();
  for (const event of twoAreas) connection.event(event);
  connection.event(runEnded(7, 'Completed', undefined, 1));

  fireEvent.click(await screen.findByRole('button', { name: 'Retry failed areas' }));

  await waitFor(() => {
    expect(window.location.pathname).toBe('/runs/run-2');
  });
  expect(calls.find((call) => call.path === startPath)).toMatchObject({
    method: 'POST',
    csrf: 'csrf-0',
    body: retryBody,
  });
});

it('RF-208 a retry the project refuses for missing cloud consent shows why and points to the start page', async () => {
  const { stream } = renderLive({ [`POST ${startPath}`]: failure(400, 'RST-1515') });
  const connection = await stream.connection();
  for (const event of twoAreas) connection.event(event);
  connection.event(runEnded(7, 'Completed', undefined, 1));

  fireEvent.click(await screen.findByRole('button', { name: 'Retry failed areas' }));

  const banner = await screen.findByTestId('failed-areas');
  await waitFor(() => {
    expect(within(banner).getByTestId('error-banner').textContent).toContain('RST-1515');
  });
  expect(within(banner).getByRole('link', { name: 'Start page' }).getAttribute('href')).toBe(
    '/projects/p-1/start',
  );
});

it('RF-208 two clicks on Retry failed areas start one run, not two', async () => {
  const { stream, calls } = renderLive({ [`POST ${startPath}`]: started });
  const connection = await stream.connection();
  for (const event of twoAreas) connection.event(event);
  connection.event(runEnded(7, 'Completed', undefined, 1));
  const button = await screen.findByRole('button', { name: 'Retry failed areas' });

  fireEvent.click(button);
  fireEvent.click(button);

  await waitFor(() => {
    expect(window.location.pathname).toBe('/runs/run-2');
  });
  expect(calls.filter((call) => call.path === startPath)).toHaveLength(1);
});
