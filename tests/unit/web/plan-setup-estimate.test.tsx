import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import {
  cloudEstimate,
  cloudProject,
  planEstimate,
  savedBrief,
  startedPlanRun,
} from './plan-setup-fixtures.js';
import { base, ready, renderPlan } from './plan-setup-helpers.js';

// RF-613, RF-143, RF-427, RF-605: the estimate of the plan run against the caps, what stops
// "Start the plan", and the start of the run.

const savedAnswers = { [`GET ${base}/planning-brief`]: json(200, savedBrief) };
const write = (): HTMLButtonElement => {
  const button = screen.getByRole('button', { name: /^Start the plan/u });
  if (!(button instanceof HTMLButtonElement)) throw new Error('Not a button.');
  return button;
};
const withPlanner = (change: object) => ({
  [`GET ${base}/plan-estimate`]: json(200, {
    ...planEstimate,
    planner: { ...planEstimate.planner, ...change },
  }),
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('plan estimate', () => {
  it('RF-613 shows the likely cost of the planner against the caps', async () => {
    renderPlan(savedAnswers);
    await ready();

    const card = screen.getByRole('region', { name: 'Plan estimate' });
    expect(card.textContent).toContain('$0.1800 likely');
    expect(card.textContent).toContain('$0.0900');
    expect(card.textContent).toContain('$0.4000');
    expect(within(card).getByText('Run cost cap')).not.toBeNull();
    expect(card.textContent).toContain('$2.00');
  });

  it('RF-613 reads the number of calls from the estimate when it names one, and from nowhere else', async () => {
    const first = renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-estimate`]: json(200, { ...planEstimate, assumptions: { calls: 2 } }),
    });
    await ready();
    expect(screen.getByRole('region', { name: 'Plan estimate' }).textContent).toContain(
      '2 planner calls',
    );
    first.unmount();

    renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-estimate`]: json(200, { ...planEstimate, assumptions: {} }),
    });
    await ready();
    expect(screen.getByRole('region', { name: 'Plan estimate' }).textContent).not.toContain(
      'planner calls',
    );
  });

  it('RF-613 warns about a figure over a cap and still lets the run start', async () => {
    const cap = { ...planEstimate.caps[0], fits: { low: true, likely: true, high: false } };
    renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-estimate`]: json(200, { ...planEstimate, caps: [cap] }),
    });
    await ready();

    expect(screen.getByText(/does not fit the run cap/u)).not.toBeNull();
    expect(write().disabled).toBe(false);
  });
});

describe('plan estimate before a brief is saved', () => {
  it('RF-613 asks no estimate while no brief is saved, and shows it after the first save', async () => {
    const page = renderPlan();
    await ready();

    const card = screen.getByRole('region', { name: 'Plan estimate' });
    expect(card.textContent).toContain('appears once your answers are saved');
    expect(page.calls.some((call) => call.path === `${base}/plan-estimate`)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Use the defaults for the rest' }));

    await waitFor(() => {
      expect(card.textContent).toContain('$0.1800 likely');
    });
    expect(page.calls.some((call) => call.path.startsWith(`${base}/plan-estimate`))).toBe(true);
  });
});

describe('plan estimate blockers', () => {
  it('RF-427 blocks an unpriced planner model with a clear message', async () => {
    renderPlan({ ...savedAnswers, ...withPlanner({ priced: false }) });
    await ready();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('RST-1601');
    expect(alert.textContent).toContain('no usable price');
    expect(write().disabled).toBe(true);
  });

  it('RF-2302 blocks a planner with no key and points to Settings and keys', async () => {
    renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-estimate`]: json(200, { ...planEstimate, keyAvailable: false }),
    });
    await ready();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('RST-2302');
    expect(within(alert).getByRole('link', { name: 'Settings and keys' })).not.toBeNull();
    expect(write().disabled).toBe(true);
  });

  it('RF-613 says the estimate could not be read and does not allow the run', async () => {
    renderPlan({ ...savedAnswers, [`GET ${base}/plan-estimate`]: failure(404, 'RST-2003') });
    await screen.findByRole('heading', { name: 'Plan setup', level: 1 });

    expect((await screen.findByTestId('error-banner')).textContent).toContain('RST-2003');
    expect(write().disabled).toBe(true);
  });
});

describe('write the package', () => {
  it('RF-605 waits for the steps to be finished', async () => {
    renderPlan();
    await ready();

    expect(write().disabled).toBe(true);
    expect(write().title).toContain('Finish the steps');
  });

  it('RF-604 starts the plan run and opens it', async () => {
    const page = renderPlan({
      ...savedAnswers,
      [`POST ${base}/runs`]: json(202, startedPlanRun),
    });
    await ready();

    fireEvent.click(write());

    await waitFor(() => {
      expect(window.location.pathname).toBe(`/runs/${startedPlanRun.id}`);
    });
    const start = page.calls.find((call) => call.path === `${base}/runs`);
    expect(start?.body).toEqual({ stage: 'plan', cloudConsent: false, sourceRunId: 'run-1' });
  });
});

describe('write the package with consent', () => {
  it('RF-143 needs the consent of a cloud planner and sends it with the run', async () => {
    const page = renderPlan({
      ...savedAnswers,
      [`GET ${base}`]: json(200, cloudProject),
      [`GET ${base}/plan-estimate`]: json(200, cloudEstimate),
      [`POST ${base}/runs`]: json(202, startedPlanRun),
    });
    await ready();

    expect(write().disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand; send masked excerpts/u }));
    expect(write().disabled).toBe(false);
    fireEvent.click(write());

    await waitFor(() => {
      expect(
        page.calls.some((call) => call.method === 'POST' && call.path === `${base}/runs`),
      ).toBe(true);
    });
    expect(page.calls.find((call) => call.path === `${base}/runs`)?.body).toEqual({
      stage: 'plan',
      cloudConsent: true,
      sourceRunId: 'run-1',
    });
  });

  it('RF-605 shows the refusal of the run and stays on the page', async () => {
    renderPlan({ ...savedAnswers, [`POST ${base}/runs`]: failure(409, 'RST-2302') });
    await ready();

    fireEvent.click(write());

    expect((await screen.findAllByTestId('error-banner'))[0]?.textContent).toContain('RST-2302');
    expect(window.location.pathname).toBe('/');
  });

  it('RF-605 says a package is out of date after a change and offers to write it again', async () => {
    renderPlan({
      [`GET ${base}/planning-brief`]: json(200, { ...savedBrief, outOfDate: true }),
    });
    await ready();

    expect(screen.getByText(/package is out of date/u)).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Start the plan again/u })).not.toBeNull();
  });
});

// P8-01, EV-82: the plan estimate of the evaluation's Haiku eShop project, synthetic in its names:
// 14 planner calls (the plan, the PRD, six data-model batches, flows, the API contract, the user
// interface, coverage, the gap and its repair) under the project defaults of $0.5000 per run.
const evaluated = (runLine: 'journey' | 'project', approved: boolean) => ({
  ...planEstimate,
  planner: {
    ...planEstimate.planner,
    low: { inputTokens: 180_000, outputTokens: 40_000, costMicros: '210000' },
    likely: { inputTokens: 260_000, outputTokens: 70_000, costMicros: '330000' },
    high: { inputTokens: 520_000, outputTokens: 300_000, costMicros: '1720000' },
  },
  assumptions: { calls: 14 },
  runLine,
  caps: [
    {
      kind: 'run-cost',
      unit: 'micros',
      approved,
      limit: approved ? '3100000' : '500000',
      spent: '0',
      remaining: approved ? '3100000' : '500000',
      fits: { low: true, likely: true, high: approved },
    },
  ],
  withinCaps: { low: true, likely: true, high: approved },
});

describe('plan estimate of the evaluated 14-call plan', () => {
  it('RF-613 EV-82 a high figure over the project run cap reads "does not fit the run cap" with both figures', async () => {
    renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-estimate`]: json(200, evaluated('project', false)),
    });
    await ready();

    const card = screen.getByRole('region', { name: 'Plan estimate' });
    expect(card.textContent).toContain('14 planner calls');
    expect(card.textContent).toContain('$0.3300 likely');
    expect(card.textContent).toContain('low $0.2100, high $1.72');
    expect(card.textContent).toContain(
      'The high estimate ($1.72) does not fit the run cap ($0.5000 left)',
    );
    expect(card.textContent).not.toMatch(/\bfits\b/u);
    expect(screen.getByTestId('plan-run-line').textContent).toContain('the project run caps apply');
  });

  it('RF-435 P8-01 a plan of a journey names the approved amount as its line, not the project run cap', async () => {
    renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-estimate`]: json(200, evaluated('journey', true)),
    });
    await ready();

    const card = screen.getByRole('region', { name: 'Plan estimate' });
    expect(within(card).getByText('Approved amount left')).not.toBeNull();
    expect(within(card).queryByText('Run cost cap')).toBeNull();
    expect(screen.getByTestId('plan-run-line').textContent).toContain(
      'under what is left of the amount you approved for the journey, not under the project run caps',
    );
    expect(card.textContent).not.toContain('does not fit');
  });
});

describe('plan estimate of the evaluated plan under the journey amount', () => {
  it('RF-432 P8-01 a high figure over what is left of the approved amount says the run pauses there', async () => {
    const over = evaluated('journey', true);
    const cap = over.caps[0];
    if (cap === undefined) throw new Error('No cap.');
    const capped = {
      ...over,
      caps: [
        {
          ...cap,
          limit: '900000',
          remaining: '900000',
          fits: { low: true, likely: true, high: false },
        },
      ],
    };
    renderPlan({ ...savedAnswers, [`GET ${base}/plan-estimate`]: json(200, capped) });
    await ready();

    expect(screen.getByRole('region', { name: 'Plan estimate' }).textContent).toContain(
      'The high estimate ($1.72) does not fit what is left of the approved amount ($0.9000): the run pauses and asks before it passes it.',
    );
  });
});
