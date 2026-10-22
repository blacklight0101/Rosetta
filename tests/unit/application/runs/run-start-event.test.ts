import { expect, it } from 'vitest';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';

// RF-1106, DEC-107: `run.started` records the effective caps of the run with where each comes from,
// so the page and the log say which cap applies before the first call. The recorded events are the
// only evidence the tests read (the probes of card P3-91: server key with an administrator cap lower
// than the project's, and an own key where the project's cap applies alone).

const serverStart = {
  keySource: 'server' as const,
  run: { maxCostMicros: 500_000n, source: 'administrator' as const },
  userDay: { maxCostMicros: 1_000_000n, source: 'administrator' as const },
};

const ownStart = {
  keySource: 'user' as const,
  run: { maxCostMicros: 5_000_000n, source: 'project' as const },
};

it('RF-1106 a server key run records the administrator run cap as its cap and names the administrator', async () => {
  const h = createRunHarness({ startCaps: { of: () => Promise.resolve(serverStart) } });
  const run = await h.start(userAmy);
  h.executor.settle(run.id, { endState: 'Completed' });
  await h.ended(run);

  const [started] = await h.events.read(h.scopeOf(run), 0);
  expect(started?.type).toBe('run.started');
  expect(started?.data).toMatchObject({
    caps: { run: { maxCostMicros: 500_000 } },
    effectiveCaps: {
      keySource: 'server',
      run: { maxCostMicros: 500_000, source: 'administrator' },
      userDay: { maxCostMicros: 1_000_000, source: 'administrator' },
    },
  });
});

it('RF-1106 an own key run records the project run cap and no administrator day figure', async () => {
  const h = createRunHarness({ startCaps: { of: () => Promise.resolve(ownStart) } });
  const run = await h.start(userAmy);
  h.executor.settle(run.id, { endState: 'Completed' });
  await h.ended(run);

  const [started] = await h.events.read(h.scopeOf(run), 0);
  expect(started?.data).toMatchObject({
    caps: { run: { maxCostMicros: 5_000_000 } },
    effectiveCaps: { keySource: 'user', run: { maxCostMicros: 5_000_000, source: 'project' } },
  });
  expect(started?.data).not.toHaveProperty('effectiveCaps.userDay');
});

it('RF-1106 without start caps the event carries the caps of the project only', async () => {
  const h = createRunHarness();
  const run = await h.start(userAmy);
  h.executor.settle(run.id, { endState: 'Completed' });
  await h.ended(run);

  const [started] = await h.events.read(h.scopeOf(run), 0);
  expect(started?.data).not.toHaveProperty('effectiveCaps');
});
