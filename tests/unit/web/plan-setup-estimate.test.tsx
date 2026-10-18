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
// "Write the package", and the start of the run.

const savedAnswers = { [`GET ${base}/planning-brief`]: json(200, savedBrief) };
const write = (): HTMLButtonElement => {
  const button = screen.getByRole('button', { name: /^Write the package/u });
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
    expect(card.textContent).toContain('$0.18 likely');
    expect(card.textContent).toContain('$0.09');
    expect(card.textContent).toContain('$0.40');
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

    expect(screen.getByText(/could pass the Run cost cap/u)).not.toBeNull();
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
      expect(card.textContent).toContain('$0.18 likely');
    });
    expect(page.calls.some((call) => call.path === `${base}/plan-estimate`)).toBe(true);
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
    expect(start?.body).toEqual({ stage: 'plan', cloudConsent: false });
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
    expect(screen.getByRole('button', { name: /^Write the package again/u })).not.toBeNull();
  });
});
