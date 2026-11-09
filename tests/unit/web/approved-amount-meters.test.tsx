import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import {
  approvedLineOf,
  approvedViewOf,
  lineAfter,
} from '../../../web/src/lib/live-run/approved-line.js';
import { runMeterReadingOf } from '../../../web/src/lib/live-run/run-meter-reading.js';
import { topBarMeterOf } from '../../../web/src/lib/live-run/top-bar-meter.js';
import { TopbarRunMeter } from '../../../web/src/components/TopbarRunMeter.js';
import { ApprovedViewContext } from '../../../web/src/pages/approved-view-context.js';
import { RunMeter } from '../../../web/src/pages/RunMeter.js';
import { SpendPanel } from '../../../web/src/pages/SpendPanel.js';
import { stateAfter } from './live-run-fixtures.js';

// RF-1003, RF-424, RF-434, DEC-205, DEC-206, P8-24: during a run of a journey every meter shows the one
// amount, the approved amount left ("$3.96 left of $4.00 approved"), and never the project run cap
// ($0.50) or the project token cap (2,000,000) that the approval replaced.

const budget = {
  approvedMicros: 4_000_000,
  remainingMicros: 3_962_940,
  approvedTokens: 4_000_000,
  remainingTokens: 3_900_000,
};
const caps = { maxCostMicros: 500_000, maxTokens: 2_000_000 };
const view = approvedViewOf(approvedLineOf(budget), 'micros');

describe('RF-1003 the approved amount as one figure', () => {
  it('RF-1003 says what is left of what was approved, in whole cents, rounding the left down', () => {
    expect(view?.text).toBe('$3.96 left of $4.00 approved');
    expect(view).toMatchObject({ spent: 37_060, cap: 4_000_000, unit: 'micros' });
  });

  it('RF-1003 counts tokens for a journey on local models', () => {
    const tokens = approvedViewOf(approvedLineOf({ ...budget, approvedMicros: 0 }), 'tokens');

    expect(tokens?.text).toBe('3,900,000 tokens left of 4,000,000 approved');
    expect(tokens).toMatchObject({ spent: 100_000, cap: 4_000_000, unit: 'tokens' });
  });

  it('RF-1003 has no approved amount for a project without a journey', () => {
    expect(approvedLineOf(null)).toBeUndefined();
    expect(approvedLineOf(undefined)).toBeUndefined();
  });

  it('RF-1003 takes what the run spent since the journey was read off what is left, never below zero', () => {
    const line = approvedLineOf(budget);
    if (line === undefined) throw new Error('The line is missing.');

    expect(lineAfter(line, { micros: 1_000_000, tokens: 50_000 })).toMatchObject({
      remainingMicros: 2_962_940,
      remainingTokens: 3_850_000,
    });
    expect(lineAfter(line, { micros: 9_000_000, tokens: 9_000_000 })).toMatchObject({
      remainingMicros: 0,
      remainingTokens: 0,
    });
  });

  it('RF-1003 reads the top bar meter from the approved amount when there is one, else from the cap', () => {
    const withLine = runMeterReadingOf({
      ...{ caps, costMicros: 37_060, tokens: 100_000, local: false },
      approved: view,
    });
    const without = runMeterReadingOf({ caps, costMicros: 37_060, tokens: 100_000, local: false });

    expect(withLine).toEqual({
      ...{ spent: 37_060, cap: 4_000_000, unit: 'micros' },
      approvedText: '$3.96 left of $4.00 approved',
    });
    expect(without).toEqual({ spent: 37_060, cap: 500_000, unit: 'micros' });
  });
});

describe('RF-1003 the header meter, the spend panel and the run meter', () => {
  it('RF-1003 the header meter shows the approved amount left and not the project run cap', () => {
    const meter = topBarMeterOf(37_060, 4_000_000, 'micros', '$3.96 left of $4.00 approved');
    render(<TopbarRunMeter meter={meter} />);

    const text = screen.getByTestId('topbar-run-meter').textContent;
    expect(text).toContain('$3.96 left of $4.00 approved');
    expect(text).not.toContain('$0.50');
  });
});

describe('RF-1003 the spend panel and the run meter', () => {
  it('RF-1003 the spend panel shows the approved amount left, with no cap and no token cap', () => {
    render(
      <ApprovedViewContext.Provider value={view}>
        <SpendPanel
          {...{ runId: 'r-1', costMicros: 37_060, tokens: 366_378, caps }}
          onOpenRoles={() => undefined}
        />
      </ApprovedViewContext.Provider>,
    );

    const text = screen.getByRole('region', { name: 'Spend for this run' }).textContent;
    expect(text).toContain('$3.96 left of $4.00 approved');
    expect(text).toContain('366,378 tokens');
    expect(text).not.toContain('$0.50');
    expect(text).not.toContain('2,000,000');
  });

  it('RF-1003 the spend panel keeps the run cap for a run outside a journey', () => {
    render(
      <SpendPanel
        {...{ runId: 'r-1', costMicros: 37_060, tokens: 366_378, caps }}
        onOpenRoles={() => undefined}
      />,
    );

    expect(screen.getByRole('region', { name: 'Spend for this run' }).textContent).toContain(
      'cap $0.50',
    );
  });

  it('RF-424 the run meter shows one bar for the approved amount and no run cap', () => {
    render(
      <ApprovedViewContext.Provider value={view}>
        <RunMeter state={stateAfter()} costMicros={37_060} estimate={undefined} />
      </ApprovedViewContext.Provider>,
    );

    const text = screen.getByRole('region', { name: 'Run meter' }).textContent;
    expect(text).toContain('$3.96 left of $4.00 approved');
    expect(text).not.toContain('$0.50');
    expect(text).not.toContain('2,000,000');
    expect(screen.getAllByRole('meter')).toHaveLength(1);
  });
});
