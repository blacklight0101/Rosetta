import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { estimateSchema, type RunEstimate } from '../../../web/src/api/estimate-schemas.js';
import { capWarnings } from '../../../web/src/lib/cap-warnings.js';
import { EstimateSection } from '../../../web/src/pages/EstimateSection.js';
import { cloudEstimate } from './start-run-fixtures.js';

// RF-434, RF-435, RF-1106, P9-12, P9-14: a journey's approved amount replaces the project's run
// caps, so the start page names one limit: no run cap warning and no server run cap note beside it,
// and the meter without a journey still compares the likely figure with the project's run cap.

const journey = {
  ...{ basis: 'assumptions', deepenRounds: 3, ceilingApplied: true },
  likely: { tokens: 2_600_000, costMicros: '1200000' },
  worstCase: { tokens: 9_000_000, costMicros: '9000000' },
  approvable: { tokens: 5_000_000, costMicros: '4000000' },
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
    { kind: 'role-cost', unit: 'micros', limit: '500000', spent: '0', fits: false },
  ],
};

const withJourney: RunEstimate = estimateSchema.parse({ ...cloudEstimate, journey, firstCalls });
const props = {
  scanOnly: false,
  sourceKind: 'github',
  cap: {
    capMicros: 500_000n,
    serverRunCap: { administrator: 100_000n, serverKeys: true },
    capTokens: 2_000_000,
  },
  capsHref: '/projects/p-1/settings#caps',
  onRetry: () => undefined,
} as const;

it('RF-434 P9-14 a journey estimate names no project run cap in its warnings', () => {
  const ids = capWarnings({
    estimate: withJourney,
    runCapMicros: 100_000n,
    limits: undefined,
    approvedLine: true,
  }).map((warning) => warning.id);

  expect(ids).not.toContain('run');
  expect(ids).not.toContain('first-calls-run-cost');
  expect(ids).toContain('first-calls-role-cost');
});

it('RF-434 P9-14 without a journey the project run cap is still named', () => {
  const ids = capWarnings({
    estimate: estimateSchema.parse({ ...cloudEstimate, firstCalls }),
    runCapMicros: 100_000n,
    limits: undefined,
  }).map((warning) => warning.id);

  expect(ids).toContain('first-calls-run-cost');
});

it('RF-1106 P9-14 the server run cap note is not shown beside a journey approved amount', () => {
  render(
    <EstimateSection
      {...props}
      estimate={{ status: 'ready', estimate: withJourney }}
      warnings={[]}
    />,
  );

  expect(screen.queryByTestId('server-run-cap-note')).toBeNull();
});

it('RF-425 P9-12 without a journey the meter compares the likely cost with the run cap', () => {
  const estimate = estimateSchema.parse(cloudEstimate);
  render(<EstimateSection {...props} estimate={{ status: 'ready', estimate }} warnings={[]} />);

  const meter = screen.getByRole('meter');
  expect(meter.getAttribute('aria-label')).toBe('Likely cost against the cap');
  expect(screen.getByText(/of the cap; the marker/u)).toBeTruthy();
  expect(screen.queryByText(/approved amount/u)).toBeNull();
  expect(screen.getByRole('link', { name: /Change the caps/u })).toBeTruthy();
});
