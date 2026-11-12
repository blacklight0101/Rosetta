import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import type { RunEstimate } from '../../../web/src/api/estimate-schemas.js';
import {
  estimateLinesOf,
  figureMovedText,
  journeyBarText,
} from '../../../web/src/lib/journey-approval.js';
import { EstimateSection } from '../../../web/src/pages/EstimateSection.js';

// RF-430, RF-434, P9-11, EV-96: no line names a likely figure above the approvable one without
// saying what follows, and an approvable figure that moved between two reads is never swapped
// without a word.

const point = { inputTokens: 800, outputTokens: 200, costMicros: '1000' };

function estimateOf(journey: Partial<NonNullable<RunEstimate['journey']>>): RunEstimate {
  return {
    ...{ priceTableVersion: '2026-10-11', currency: 'USD', areas: [] },
    assumptions: { turnsPerArea: { low: 2, likely: 3, high: 10 } },
    roles: [
      {
        ...{ role: 'reader', provider: 'openai', kind: 'openai', model: 'priced-model' },
        ...{ keySource: 'user', priced: true, low: point, likely: point, high: point },
      },
    ],
    total: { low: point, likely: point, high: point },
    journey: {
      ...{ basis: 'assumptions', deepenRounds: 3, ceilingApplied: false },
      likely: { tokens: 1_000_000, costMicros: '1000000' },
      worstCase: { tokens: 3_000_000, costMicros: '3000000' },
      approvable: { tokens: 3_000_000, costMicros: '3000000' },
      ...journey,
    },
  };
}

const dollarsAbove = estimateOf({
  likely: { tokens: 3_000_000, costMicros: '4085000' },
  approvable: { tokens: 3_500_000, costMicros: '4000000' },
});
const tokensAbove = estimateOf({
  likely: { tokens: 60_000_000, costMicros: '1000000' },
  approvable: { tokens: 50_000_000, costMicros: '4000000' },
});
const first = estimateOf({
  basis: 'assumptions',
  likely: { tokens: 1, costMicros: '900000' },
  approvable: { tokens: 1, costMicros: '1318000' },
});
const later = estimateOf({
  basis: 'history',
  likely: { tokens: 1, costMicros: '200000' },
  approvable: { tokens: 1, costMicros: '314000' },
});

it('RF-434 P9-11 the bar names the likely figure, the approved one and what follows', () => {
  expect(journeyBarText(dollarsAbove)).toBe(
    'Likely $4.09, above the $4.00 approved: the run pauses and asks',
  );
  expect(journeyBarText(estimateOf({}))).toBeUndefined();
});

it('RF-434 P9-11 a likely token count above the approvable one says the run pauses and asks', () => {
  const lines = estimateLinesOf(tokensAbove);

  expect(lines?.likely).toContain('likely above what can be approved');
  expect(lines?.stops).toBe('the run will pause and ask at the approved amount');
  expect(journeyBarText(tokensAbove)).toContain('the run pauses and asks');
});

it('RF-430 P9-11 a moved approvable figure is named with both figures and the reason', () => {
  expect(figureMovedText(first, later)).toBe(
    'The approvable figure moved from $1.32 to $0.3140. The figures changed: they now come from the measured totals of earlier runs of this model, not from the fixed assumptions.',
  );
  expect(figureMovedText(first, first)).toBeUndefined();
  expect(figureMovedText(first, estimateOf({ ...first.journey, ceilingApplied: true }))).toBe(
    undefined,
  );
});

it('RF-430 P9-11 a changed ceiling moves the figure with a reason that is not the basis', () => {
  const lowered = estimateOf({ ...first.journey, approvable: { tokens: 1, costMicros: '500000' } });

  expect(figureMovedText(first, lowered)).toBe(
    'The approvable figure moved from $1.32 to $0.5000. The ceilings, the settings or the areas changed since the earlier read.',
  );
});

const props = {
  scanOnly: false,
  sourceKind: 'github',
  cap: {
    capMicros: 500_000n,
    serverRunCap: { administrator: undefined, serverKeys: false },
    capTokens: 2_000_000,
  },
  warnings: [],
  capsHref: '/projects/p-1/settings#caps',
  onRetry: () => undefined,
} as const;

it('RF-434 P9-11 a later read on the same page does not replace the figure without a word', () => {
  const view = render(
    <EstimateSection {...props} estimate={{ status: 'ready', estimate: first }} />,
  );
  expect(screen.getByTestId('journey-approved').textContent).toContain('$1.32');
  expect(screen.queryByTestId('journey-moved')).toBeNull();

  view.rerender(<EstimateSection {...props} estimate={{ status: 'ready', estimate: later }} />);

  expect(screen.getByTestId('journey-approved').textContent).toContain('$0.3140');
  expect(screen.getByTestId('journey-moved').textContent).toContain('moved from $1.32 to $0.3140');
  view.rerender(<EstimateSection {...props} estimate={{ status: 'ready', estimate: first }} />);
  expect(screen.queryByTestId('journey-moved')).toBeNull();
});
