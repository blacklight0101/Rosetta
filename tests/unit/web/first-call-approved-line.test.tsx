import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { estimateSchema, type RunEstimate } from '../../../web/src/api/estimate-schemas.js';
import { capWarnings } from '../../../web/src/lib/cap-warnings.js';
import { EstimateSection } from '../../../web/src/pages/EstimateSection.js';
import { cloudEstimate } from './start-run-fixtures.js';

// RF-434, RF-405, RF-1106, P9-19: beside a journey the project run caps are replaced by the
// approved amount, but a first call whose reservation is above the approvable figure still cannot
// be made, so the start page says so in one line worded against the approved amount.

const journey = {
  ...{ basis: 'assumptions', deepenRounds: 3, ceilingApplied: true },
  likely: { tokens: 20_000, costMicros: '300000' },
  worstCase: { tokens: 9_000_000, costMicros: '9000000' },
  approvable: { tokens: 5_000_000, costMicros: '500000' },
};

const firstCalls = {
  calls: 4,
  promptTokens: 6000,
  maxOutputTokens: 8192,
  perCallMicros: '195000',
  reservedMicros: '780000',
  reservedTokens: '56768',
  adminRunCapMicros: null,
  caps: [
    { kind: 'run-cost', unit: 'micros', limit: '500000', spent: '0', fits: false },
    { kind: 'run-tokens', unit: 'tokens', limit: '40000', spent: '0', fits: false },
  ],
};

const estimateWith = (approvable: Record<string, unknown>): RunEstimate =>
  estimateSchema.parse({
    ...cloudEstimate,
    journey: { ...journey, approvable: { ...journey.approvable, ...approvable } },
    firstCalls,
  });

const warningsOf = (estimate: RunEstimate) =>
  capWarnings({ estimate, runCapMicros: 100_000n, limits: undefined, approvedLine: true });

it('RF-434 P9-19 a first-call reservation above the approvable dollars warns against the approved amount', () => {
  const [warning, ...rest] = warningsOf(estimateWith({ costMicros: '500000' }));

  expect(rest).toEqual([]);
  expect(warning?.id).toBe('first-calls-approved');
  expect(warning?.text).toContain('$0.78');
  expect(warning?.text).toContain('approved amount of $0.50');
  expect(warning?.text).not.toContain('run cap');
  expect(warning?.projectCaps).toBe(false);
  expect(warning?.text.split(' ').length).toBeLessThan(40);
});

it('RF-434 P9-19 a reservation above the approvable tokens warns in tokens', () => {
  const [warning] = warningsOf(estimateWith({ costMicros: '9000000', tokens: 40_000 }));

  expect(warning?.id).toBe('first-calls-approved');
  expect(warning?.text).toContain('approved amount of 40,000 tokens');
});

it('RF-434 P9-19 an approvable figure that holds the reservation adds no warning', () => {
  expect(warningsOf(estimateWith({ costMicros: '4000000' }))).toEqual([]);
});

it('RF-434 P9-19 the start page shows the warning before Start, beside the journey estimate', () => {
  const estimate = estimateWith({ costMicros: '500000' });
  render(
    <EstimateSection
      {...{ scanOnly: false, sourceKind: 'github', onRetry: () => undefined }}
      cap={{
        capMicros: 500_000n,
        serverRunCap: { administrator: undefined, serverKeys: false },
        capTokens: 2_000_000,
      }}
      capsHref="/projects/p-1/settings#caps"
      estimate={{ status: 'ready', estimate }}
      warnings={warningsOf(estimate)}
    />,
  );

  expect(screen.getByTestId('cap-warning').textContent).toContain('approved amount of $0.50');
  expect(screen.queryByRole('link', { name: /Review the caps/u })).toBeNull();
});
