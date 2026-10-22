import { expect, it } from 'vitest';
import { estimateSchema, type RunEstimate } from '../../../web/src/api/estimate-schemas.js';
import { capWarnings } from '../../../web/src/lib/cap-warnings.js';
import { cloudEstimate } from './start-run-fixtures.js';

// RF-405, RF-1106, DEC-159 (P3-96): the start page warns, before the run, when the caps cannot hold
// the reservation of the first reader calls; it names the cap and the amount, and the run cap
// typed on the page is the one compared (the administrator's lower cap still wins).

function withFirstCalls(change: Record<string, unknown>): RunEstimate {
  const firstCalls = {
    calls: 4,
    promptTokens: 6000,
    maxOutputTokens: 8192,
    perCallMicros: '195000',
    reservedMicros: '780000',
    reservedTokens: '56768',
    adminRunCapMicros: '3000000',
    caps: [
      { kind: 'run-cost', unit: 'micros', limit: '500000', spent: '0', fits: false },
      { kind: 'user-day', unit: 'micros', limit: '1000000', spent: '0', fits: true },
    ],
    ...change,
  };
  return estimateSchema.parse({ ...cloudEstimate, firstCalls });
}

const textOf = (estimate: RunEstimate, runCapMicros: bigint) =>
  capWarnings({ estimate, runCapMicros, limits: undefined }).filter((warning) =>
    warning.id.startsWith('first-calls'),
  );

it('RF-405 the run cap that cannot hold the first calls is named with the amount needed', () => {
  const [warning, ...rest] = textOf(withFirstCalls({}), 500_000n);

  expect(rest).toEqual([]);
  expect(warning?.id).toBe('first-calls-run-cost');
  expect(warning?.text).toContain('4 first reader calls');
  expect(warning?.text).toContain('run cap of $0.50');
  expect(warning?.text).toContain('$0.78');
  expect(warning?.text).toContain('Raise the run cap');
});

it('RF-405 a run cap raised on the page to 3.00 USD removes the warning', () => {
  expect(textOf(withFirstCalls({}), 3_000_000n)).toEqual([]);
});

it('RF-1106 a lower administrator cap is the one named, and the page cannot raise it', () => {
  const estimate = withFirstCalls({ adminRunCapMicros: '300000' });
  const [warning] = textOf(estimate, 3_000_000n);

  expect(warning?.text).toContain("administrator's run cap of $0.30");
  expect(warning?.text).not.toContain('Raise the run cap');
});

it('RF-1106 another cap that is short is named on its own', () => {
  const estimate = withFirstCalls({
    caps: [{ kind: 'user-day', unit: 'micros', limit: '400000', spent: '100000', fits: false }],
  });
  const [warning] = textOf(estimate, 3_000_000n);

  expect(warning?.id).toBe('first-calls-user-day');
  expect(warning?.text).toContain('daily cap');
  expect(warning?.text).toContain('$0.88');
});

it('RF-405 an estimate that fits shows no first-call warning', () => {
  const estimate = withFirstCalls({
    reservedMicros: '100000',
    caps: [{ kind: 'run-cost', unit: 'micros', limit: '500000', spent: '0', fits: true }],
  });

  expect(textOf(estimate, 500_000n)).toEqual([]);
});

it('RF-405 an estimate without first calls (an older server) shows none', () => {
  expect(textOf(estimateSchema.parse(cloudEstimate), 1n)).toEqual([]);
});
