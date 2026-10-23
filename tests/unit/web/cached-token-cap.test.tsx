import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { capTokensOf, tokenFiguresOf } from '../../../web/src/lib/live-run/cap-tokens.js';
import { roleTotalsOf } from '../../../web/src/lib/live-run/run-summary.js';
import { RunMeter } from '../../../web/src/pages/RunMeter.js';
import { SpendPanel } from '../../../web/src/pages/SpendPanel.js';
import { ev, startedData, stateAfter } from './live-run-fixtures.js';

// RF-422, RF-1003, DEC-168, P5-16: the run page shows the raw token total and the total that counts
// toward the cap, where cached input counts a tenth.

const caps = { maxCostMicros: 2_000_000, maxTokens: 2_000_000 };
const used = (input: number, cached: number, output: number) =>
  stateAfter(
    ev(1, 'run.started', startedData),
    ev(2, 'usage.recorded', {
      role: 'reader',
      tokens: { inputTokens: input, outputTokens: output, cachedInputTokens: cached },
    }),
  );

const renderPanel = (costMicros: number, tokens: number, capTokens: number) =>
  render(
    <SpendPanel
      runId="r"
      costMicros={costMicros}
      tokens={tokens}
      capTokens={capTokens}
      caps={caps}
      onOpenRoles={() => undefined}
    />,
  );

describe('the tokens toward the cap', () => {
  it('RF-422 counts cached input at a tenth, and nothing else differently', () => {
    expect(capTokensOf({ input: 2_000_000, cached: 1_800_000, output: 100_000 })).toBe(480_000);
    expect(capTokensOf({ input: 2_000_000, cached: 0, output: 100_000 })).toBe(2_100_000);
  });

  it('RF-1003 keeps the cached tokens of the usage events of a role', () => {
    const [role] = roleTotalsOf(used(1_000, 800, 50));

    expect(role).toMatchObject({ inputTokens: 1_000, cachedInputTokens: 800, outputTokens: 50 });
  });

  it('RF-1003 gives the raw total and the total toward the cap', () => {
    expect(tokenFiguresOf(used(1_000, 800, 50))).toEqual({ raw: 1_050, toward: 330 });
  });
});

describe('the run page figures', () => {
  it('RF-1003 labels both totals when cached input makes them differ', () => {
    renderPanel(500_000, 2_900_000, 1_000_000);

    expect(
      screen.getByText(
        '2,900,000 tokens (1,000,000 toward the 2,000,000 cap: cached input counts 10%)',
      ),
    ).toBeTruthy();
  });

  it('RF-1003 keeps the plain line when nothing was cached', () => {
    renderPanel(500_000, 10_000, 10_000);

    expect(screen.getByText('10,000 of 2,000,000 tokens')).toBeTruthy();
  });

  it('RF-1003 measures the spend bar of a free model against the tokens toward the cap', () => {
    renderPanel(0, 2_000_000, 500_000);

    const meter = screen.getByRole('meter', { name: 'Tokens against the cap' });
    expect(meter.getAttribute('aria-valuenow')).toBe('25');
  });
});

describe('the run meter figures', () => {
  it('RF-1003 shows the meter bar and its note in tokens toward the cap', () => {
    const state = {
      ...used(1_000_000, 900_000, 100_000),
      caps: { maxCostMicros: 2_000_000, maxTokens: 1_000_000 },
    };
    render(<RunMeter state={state} costMicros={0} estimate={undefined} />);

    const bar = screen.getByRole('meter', { name: 'Run tokens against cap' });
    expect(bar.getAttribute('aria-valuenow')).toBe('29');
    expect(screen.getByTestId('cap-tokens-note').textContent).toBe(
      '1,100,000 tokens (290,000 toward the 1,000,000 cap: cached input counts 10%)',
    );
  });

  it('RF-1003 shows no note in the meter when nothing was cached', () => {
    const state = { ...used(1_000, 0, 50), caps };
    render(<RunMeter state={state} costMicros={0} estimate={undefined} />);

    expect(screen.queryByTestId('cap-tokens-note')).toBeNull();
  });
});
