import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import type { Tile } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { journeyOf } from '../../../web/src/lib/live-run/journey.js';
import type { RunPhase } from '../../../web/src/lib/live-run/run-phase.js';
import { json } from './fake-api.js';
import {
  agentEnded,
  agentStarted,
  ev,
  planned,
  runEnded,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';
import { renderLive, runUuid } from './live-run-helpers.js';

// RF-208, Q-43, RF-1015: a run that retries the failed areas of another run says so ("Retry of run
// <key>", linked), counts only the retried areas as its work in the stepper ("0 of 3 areas", not
// of the whole map), and its own "Retry failed areas" is linked to it, so a retry of a retry holds
// the cards of the whole chain.

afterEach(() => {
  vi.unstubAllGlobals();
});

const parentId = '7a1d2c3e-0000-4000-8000-000000000009';
const parentKey = '20261012-090000-understand';
const retryStarted = (seq: number, areas = 1) =>
  ev(seq, 'retry.started', {
    ...{ parentRunId: parentId, parentRunKey: parentKey, areas },
    seeded: { cards: 4, claims: 6, supported: 5, rejected: 1, citationInvalid: 0, notJudged: 0 },
  });

const running: RunPhase = { kind: 'running' };
const tile = (name: string, state: Tile['state']): Tile => ({
  ...{ name, state, tokens: 1, filesRead: 0, cards: 0, agentTaskId: undefined },
  ...{ columns: 2, rows: 1, progress: undefined },
});
const mapTiles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((name) => tile(name, 'waiting'));
const threePlanned = [
  ev(1, 'run.started', startedData),
  retryStarted(2, 3),
  planned(3, 'reader-001', 'A'),
  planned(4, 'reader-002', 'B'),
  planned(5, 'reader-003', 'C'),
] as const;

it('RF-208 the reducer keeps the run being retried and the number of areas retried', () => {
  const state = stateAfter(ev(1, 'run.started', startedData), retryStarted(2, 3));

  expect(state.retry).toEqual({ parentRunId: parentId, parentRunKey: parentKey, areas: 3 });
});

it('RF-208 a retry.started event that does not fit changes nothing', () => {
  const state = stateAfter(
    ev(1, 'run.started', startedData),
    ev(2, 'retry.started', { parentRunId: parentId, areas: 'three' }),
  );

  expect(state.retry).toBeUndefined();
});

it('RF-1015 RF-208 the stepper of a retry counts the retried areas, not those of the whole map', () => {
  const state = stateAfter(...threePlanned, agentStarted(6, 'reader-001', 'A'));

  const steps = journeyOf({ stage: 'understand', phase: running, state, tiles: mapTiles });

  expect(steps.find((step) => step.key === 'read')?.detail).toBe('0 of 3 areas');
});

it('RF-1015 the stepper of a run that retries nothing still counts the areas of the map', () => {
  const state = stateAfter(...threePlanned.filter((event) => event.type !== 'retry.started'));

  const steps = journeyOf({ stage: 'understand', phase: running, state, tiles: mapTiles });

  expect(steps.find((step) => step.key === 'read')?.detail).toBe('0 of 9 areas');
});

it('RF-208 the run page says which run it retries and links to it', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(retryStarted(2));

  const notice = await screen.findByTestId('retry-of');
  expect(notice.textContent).toContain(`Retry of run ${parentKey}`);
  expect(notice.textContent).toContain('5 of 6 claims supported');
  expect(within(notice).getByRole('link', { name: parentKey }).getAttribute('href')).toBe(
    `/runs/${parentId}`,
  );
});

it('RF-208 a run that retries nothing shows no retry notice', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));

  await screen.findAllByText('Catalog');
  expect(screen.queryByTestId('retry-of')).toBeNull();
});

const startPath = '/api/projects/p-1/runs';
const started = json(202, {
  id: 'run-2',
  runId: '20261012-110000-understand',
  stage: 'understand',
  queueState: 'Queued',
  position: null,
});
const failedOnce = [
  planned(1, 'reader-001', 'Catalog'),
  agentEnded(2, 'reader-001', 'InvalidOutput'),
] as const;

it('RF-208 Retry failed areas names the completed run it retries, so the retry holds its cards', async () => {
  const { stream, calls } = renderLive({ [`POST ${startPath}`]: started });
  const connection = await stream.connection();
  for (const event of failedOnce) connection.event(event);
  connection.event(runEnded(3, 'Completed', undefined, 1));

  fireEvent.click(await screen.findByRole('button', { name: 'Retry failed areas' }));

  await waitFor(() => {
    expect(window.location.pathname).toBe('/runs/run-2');
  });
  expect(calls.find((call) => call.path === startPath)?.body).toEqual({
    ...{ stage: 'understand', areas: ['Catalog'], cloudConsent: false },
    retryOf: runUuid,
  });
});

it('RF-208 Retry failed areas of a run that did not complete is a plain run of the areas, as before', async () => {
  const { stream, calls } = renderLive({ [`POST ${startPath}`]: started });
  const connection = await stream.connection();
  for (const event of failedOnce) connection.event(event);
  connection.event(runEnded(3, 'Failed', 'RST-1300'));

  fireEvent.click(await screen.findByRole('button', { name: 'Retry failed areas' }));

  await waitFor(() => {
    expect(window.location.pathname).toBe('/runs/run-2');
  });
  expect(calls.find((call) => call.path === startPath)?.body).toEqual({
    stage: 'understand',
    areas: ['Catalog'],
    cloudConsent: false,
  });
});
