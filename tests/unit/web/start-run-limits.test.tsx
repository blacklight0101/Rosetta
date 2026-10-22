import { screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { cloudEstimate, estimatePath, ownKeyEstimate, limitsAnswer } from './start-run-fixtures.js';
import { ready, renderStart } from './start-run-helpers.js';

// RF-1001, RF-1106, DEC-107, DEC-108 (P1-106): the start page reads the limits from the server
// (`GET /api/account/limits`) and its warning names what is really left, not the whole cap.

const limitsPath = 'GET /api/account/limits';

it('DEC-108 a server-key estimate above what is left of today warns with the amount that is left', async () => {
  renderStart({
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
    [limitsPath]: limitsAnswer({ dayLeft: '200000' }),
  });
  await ready();

  await waitFor(() => {
    expect(screen.getByTestId('cap-warning').textContent).toContain('$0.20 left');
  });
  expect(screen.getByTestId('cap-warning').textContent).toContain('$0.19');
});

it('RF-1106 an estimate above what is left of the server month says so', async () => {
  renderStart({
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
    [limitsPath]: limitsAnswer({ monthLeft: '100000' }),
  });
  await ready();

  await waitFor(() => {
    expect(screen.getByTestId('cap-warning').textContent).toContain('server');
  });
  expect(screen.getByTestId('cap-warning').textContent).toContain('$0.10 left');
});

it('DEC-107 an own-key estimate above what is left of the own daily cap names that cap', async () => {
  renderStart({
    [`GET ${estimatePath}`]: json(200, ownKeyEstimate),
    [limitsPath]: limitsAnswer({ ownDay: { cap: '1000000', spent: '700000' } }),
  });
  await ready();

  await waitFor(() => {
    expect(screen.getByTestId('cap-warning').textContent).toContain('$0.30 left');
  });
  expect(screen.getByTestId('cap-warning').textContent).toContain('daily cap');
});

it('RF-1001 limits that cannot be read leave the page without a limit warning, never an invented one', async () => {
  renderStart({
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
    [limitsPath]: failure(500, 'RST-2006'),
  });
  await ready();

  await waitFor(() => {
    expect(screen.queryByTestId('cap-warning')).toBeNull();
  });
});

it('RF-405 DEC-159 the start page warns before the run that the caps cannot hold the first calls', async () => {
  const firstCalls = {
    ...{ calls: 4, promptTokens: 6000, maxOutputTokens: 8192, perCallMicros: '195000' },
    ...{ reservedMicros: '780000', reservedTokens: '56768', adminRunCapMicros: null },
    caps: [{ kind: 'run-cost', unit: 'micros', limit: '500000', spent: '0', fits: false }],
  };
  renderStart({
    [`GET ${estimatePath}`]: json(200, { ...cloudEstimate, firstCalls }),
    [limitsPath]: limitsAnswer({}),
  });
  await ready();

  await waitFor(() => {
    expect(screen.getByTestId('cap-warning').textContent).toContain('4 first reader calls');
  });
  expect(screen.getByTestId('cap-warning').textContent).toContain('run cap of $0.50');
});
