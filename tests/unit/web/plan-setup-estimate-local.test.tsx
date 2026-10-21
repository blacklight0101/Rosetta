import { screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { planEstimate, savedBrief } from './plan-setup-fixtures.js';
import { base, ready, renderPlan } from './plan-setup-helpers.js';

// RF-613, RF-427 (Q-44): the plan estimate with a local model is in tokens and never warns that
// "$0.00 could pass the run cap"; with a priced model it is in dollars and warns when a figure is
// over a cap. A warning is worded in the unit of the cap it is about.

const figure = (tokens: number, micros: string) => ({
  inputTokens: tokens * 0.8,
  outputTokens: tokens * 0.2,
  costMicros: micros,
});
const fits = (low: boolean, likely: boolean, high: boolean) => ({ low, likely, high });
const costCap = (high: boolean) => ({
  ...{ kind: 'run-cost', unit: 'micros', limit: '2000000', spent: '0', remaining: '2000000' },
  fits: fits(true, true, high),
});
const tokenCap = (high: boolean) => ({
  ...{ kind: 'run-tokens', unit: 'tokens', limit: '100000', spent: '0', remaining: '100000' },
  fits: fits(true, true, high),
});

function answers(kind: string, parts: { readonly zero: boolean; readonly caps: object[] }) {
  const micros = (value: string): string => (parts.zero ? '0' : value);
  return {
    [`GET ${base}/planning-brief`]: json(200, savedBrief),
    [`GET ${base}/plan-estimate`]: json(200, {
      ...planEstimate,
      planner: {
        ...planEstimate.planner,
        ...{ provider: kind, kind },
        low: figure(30_000, micros('90000')),
        likely: figure(60_000, micros('180000')),
        high: figure(90_000, micros('400000')),
      },
      caps: parts.caps,
    }),
  };
}

const card = (): HTMLElement => screen.getByRole('region', { name: 'Plan estimate' });

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('RF-613 the plan estimate with a local model', () => {
  it('RF-613 shows the figures in tokens, not dollars', async () => {
    renderPlan(answers('ollama', { zero: true, caps: [costCap(true), tokenCap(true)] }));
    await ready();

    expect(card().textContent).toContain('60,000 tokens likely (low 30,000 tokens, high 90,000 tokens)');
    expect(card().querySelector('.rst-plan-estimate__lead')?.textContent).not.toContain('$');
  });

  it('RF-427 does not warn that $0.00 could pass the run cap', async () => {
    renderPlan(answers('ollama', { zero: true, caps: [costCap(false), tokenCap(true)] }));
    await ready();

    expect(card().textContent).not.toContain('could pass');
    expect(card().textContent).not.toContain('$0.00');
  });

  it('RF-427 warns in tokens when the tokens could pass the token cap', async () => {
    renderPlan(answers('ollama', { zero: true, caps: [costCap(true), tokenCap(false)] }));
    await ready();

    expect(card().textContent).toContain(
      'The high estimate (90,000 tokens) could pass the Run token cap (100,000 tokens).',
    );
  });
});

describe('RF-427 the plan estimate with a priced model', () => {
  it('RF-613 shows the figures in dollars', async () => {
    renderPlan(answers('anthropic', { zero: false, caps: [costCap(true), tokenCap(true)] }));
    await ready();

    expect(card().textContent).toContain('$0.18 likely (low $0.09, high $0.40)');
  });

  it('RF-427 warns in dollars when the high figure could pass the cost cap', async () => {
    renderPlan(answers('anthropic', { zero: false, caps: [costCap(false), tokenCap(true)] }));
    await ready();

    expect(card().textContent).toContain(
      'The high estimate ($0.40) could pass the Run cost cap ($2.00).',
    );
  });

  it('RF-427 warns in tokens, not dollars, about a token cap', async () => {
    renderPlan(answers('anthropic', { zero: false, caps: [costCap(true), tokenCap(false)] }));
    await ready();

    expect(card().textContent).toContain(
      'The high estimate (90,000 tokens) could pass the Run token cap (100,000 tokens).',
    );
    expect(card().textContent).not.toContain('($0.40) could pass the Run token cap');
  });
});
