import { expect, it } from 'vitest';
import { startedData as startedSchema } from '../../../web/src/lib/live-run/event-data.js';
import { ev, startedData, stateAfter } from './live-run-fixtures.js';

// RF-1002, P8-59: the page reads the limit from `parallelism` in `run.started`. An event log written
// before the field existed still parses and replays: its run has no limit and the rest of the
// event still applies.

it('RF-1002 a run.started stored without parallelism still parses, with no limit', () => {
  const parsed = startedSchema.safeParse(startedData);

  expect(parsed.success).toBe(true);
  expect(parsed.data?.parallelism).toBeUndefined();
});

it('RF-1002 a run.started stored without parallelism still replays its stage, source and caps', () => {
  const state = stateAfter(ev(1, 'run.started', startedData));

  expect(state.stage).toBe('understand');
  expect(state.source).toMatchObject({ owner: 'octo', repo: 'demo' });
  expect(state.caps).toMatchObject({ maxCostMicros: 2_000_000 });
});

it('RF-1002 a run.started with parallelism reads it as the limit', () => {
  const parsed = startedSchema.safeParse({ ...startedData, parallelism: 4 });

  expect(parsed.data?.parallelism).toBe(4);
});

it('RF-1002 a parallelism that is not a whole number from 1 is read as no limit, the rest still applies', () => {
  for (const parallelism of [0, -2, 2.5, '4', null]) {
    const parsed = startedSchema.safeParse({ ...startedData, parallelism });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.parallelism).toBeUndefined();
    expect(parsed.data?.stage).toBe('understand');
  }
});
