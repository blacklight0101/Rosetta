import { screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { planEstimate, savedBrief } from './plan-setup-fixtures.js';
import { base, ready, renderPlan } from './plan-setup-helpers.js';

// RF-435, RF-613, P9-02, EV-100: a journey whose remainder is below the plan estimate. Plan setup
// says what is short with both figures; with something left the plan still starts (it pauses and
// asks to Continue), with nothing left "Start the plan" waits for one action: Analyse again.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const answers = { [`GET ${base}/planning-brief`]: json(200, savedBrief) };

// As the server sends it: the approved run cap's limit is the journey's remainder (nothing is spent
// against it), and the journey block holds what was approved and whether it is used up.
const short = (remaining: string, fits = false, usedUp = remaining === '0') => ({
  ...planEstimate,
  runLine: 'journey',
  journey: { approved: { tokens: '5000000', costMicros: '3100000' }, usedUp },
  planner: {
    ...planEstimate.planner,
    likely: { inputTokens: 1000, outputTokens: 500, costMicros: '1200000' },
  },
  caps: [
    {
      kind: 'run-cost',
      unit: 'micros',
      approved: true,
      limit: remaining,
      spent: '0',
      remaining,
      fits: { low: true, likely: fits, high: fits },
    },
  ],
  withinCaps: { low: true, likely: fits, high: fits },
});

const startButton = (): HTMLButtonElement => {
  const button = screen.getByRole('button', { name: /^Start the plan/u });
  if (!(button instanceof HTMLButtonElement)) throw new Error('Not a button.');
  return button;
};

describe('plan setup with a journey that is short', () => {
  it('RF-435 P9-02 says what is short with both figures and that the plan still starts', async () => {
    renderPlan({ ...answers, [`GET ${base}/plan-estimate`]: json(200, short('900000')) });
    await ready();

    const notice = screen.getByTestId('plan-journey-short');
    expect(notice.textContent).toContain('Only $0.9000 is left of the $3.10 you approved');
    expect(notice.textContent).toContain('estimated at $1.20');
    expect(notice.textContent).toContain('Continue');
    expect(within(notice).queryByRole('link', { name: /Analyse again/u })).toBeNull();
    expect(startButton().disabled).toBe(false);
  });

  it('RF-435 P9-02 with nothing left the plan cannot start and one action is offered', async () => {
    renderPlan({ ...answers, [`GET ${base}/plan-estimate`]: json(200, short('0')) });
    await ready();

    const notice = screen.getByTestId('plan-journey-short');
    expect(notice.textContent).toContain('Nothing is left of the $3.10 you approved');
    expect(notice.textContent).toContain('estimated at $1.20');
    const link = within(notice).getByRole('link', { name: /Analyse again/u });
    expect(link.getAttribute('href')).toBe('/projects/p-1/start');
    expect(startButton().disabled).toBe(true);
    expect(screen.getByTestId('plan-start-reason').textContent).toContain('Analyse again');
  });

  it('RF-613 P9-02 a journey with enough left shows no short notice', async () => {
    renderPlan({ ...answers, [`GET ${base}/plan-estimate`]: json(200, short('3100000', true)) });
    await ready();
    expect(screen.queryByTestId('plan-journey-short')).toBeNull();
  });
});
