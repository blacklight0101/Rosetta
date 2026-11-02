import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { planSource, savedBrief, startedPlanRun } from './plan-setup-fixtures.js';
import { base, press, ready, renderPlan } from './plan-setup-helpers.js';

// RF-614, RF-605, RST-1802, RF-1105: Plan setup names the understand run it plans from, opened from a
// run (`?run=`) or from the project (the newest completed run), and the estimate, the options and
// the start of the plan run all use that run.

const savedAnswers = { [`GET ${base}/planning-brief`]: json(200, savedBrief) };
const chosen = {
  ...planSource,
  runId: 'run-7',
  runKey: '20261010-090000-understand',
  newest: false,
};

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const source = (): HTMLElement => screen.getByRole('region', { name: 'Source run' });
const pathsOf = (calls: readonly { readonly path: string }[]): string[] =>
  calls.map((call) => call.path);

describe('Plan setup names its source run', () => {
  it('RF-614 RF-605 names the run: its date, areas and Supported claims', async () => {
    renderPlan();
    await ready();

    const text = source().textContent;
    expect(text).toContain('20261012-090000-understand');
    expect(text).toContain('Orders, Catalog');
    expect(text).toContain('12 Supported claims');
    expect(text).toMatch(/2026/u);
  });

  it('RF-614 opened from the project, says it is the newest completed run', async () => {
    const page = renderPlan();
    await ready();

    expect(source().textContent).toContain('newest completed understand run');
    expect(pathsOf(page.calls)).toContain(`${base}/plan-source`);
  });

  it('RF-614 opened from a run, asks for that run and does not call it the newest', async () => {
    window.history.pushState({}, '', '/projects/p-1/plan-setup?run=run-7');
    const page = renderPlan({ [`GET ${base}/plan-source`]: json(200, chosen) });
    await ready();

    expect(pathsOf(page.calls)).toContain(`${base}/plan-source?run=run-7`);
    expect(source().textContent).toContain('20261010-090000-understand');
    expect(source().textContent).not.toContain('newest completed');
  });

  it('RF-614 says "1 Supported claim" for one', async () => {
    renderPlan({ [`GET ${base}/plan-source`]: json(200, { ...planSource, supportedClaims: 1 }) });
    await ready();

    expect(source().textContent).toContain('1 Supported claim');
    expect(source().textContent).not.toContain('1 Supported claims');
  });
});

describe('Plan setup lists a run that stopped at a cap', () => {
  const capped = { ...chosen, endState: 'CapReached', supportedClaims: 5 };

  it('RF-614 P3-121 says the run stopped at a cap and that only its judged claims are used', async () => {
    window.history.pushState({}, '', '/projects/p-1/plan-setup?run=run-7');
    renderPlan({ [`GET ${base}/plan-source`]: json(200, capped) });
    await ready();

    expect(source().textContent).toContain('5 Supported claims');
    expect(source().textContent).toContain('stopped at a cap');
    expect(source().textContent).toContain('Resume');
  });

  it('RF-614 P3-121 a completed run carries no such note', async () => {
    renderPlan();
    await ready();

    expect(source().textContent).not.toContain('stopped at a cap');
  });
});

describe('Plan setup uses the source run it names', () => {
  it('RF-614 the estimate is read for the chosen run', async () => {
    window.history.pushState({}, '', '/projects/p-1/plan-setup?run=run-7');
    const page = renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-source`]: json(200, chosen),
    });
    await ready();

    expect(pathsOf(page.calls)).toContain(`${base}/plan-estimate?run=run-7`);
  });

  it('RF-614 from the project the estimate is read for the run the page named', async () => {
    const page = renderPlan(savedAnswers);
    await ready();

    expect(pathsOf(page.calls)).toContain(`${base}/plan-estimate?run=run-1`);
  });

  it('RF-614 the options are asked for the chosen run', async () => {
    window.history.pushState({}, '', '/projects/p-1/plan-setup?run=run-7');
    const page = renderPlan({ [`GET ${base}/plan-source`]: json(200, chosen) });
    await ready();

    press('Save and continue');
    await screen.findByRole('heading', { name: /Which architecture/u, level: 2 });

    await waitFor(() => {
      expect(page.calls.find((call) => call.path === `${base}/plan-options`)?.body).toEqual({
        cloudConsent: false,
        sourceRunId: 'run-7',
      });
    });
  });
});

describe('Plan setup starts the plan from the source run', () => {
  it('RF-614 Start the plan starts the plan run from the chosen run, only when pressed', async () => {
    window.history.pushState({}, '', '/projects/p-1/plan-setup?run=run-7');
    const page = renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-source`]: json(200, chosen),
      [`POST ${base}/runs`]: json(202, startedPlanRun),
    });
    await ready();
    expect(page.calls.some((call) => call.path === `${base}/runs`)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /^Start the plan/u }));

    await waitFor(() => {
      expect(page.calls.find((call) => call.path === `${base}/runs`)?.body).toEqual({
        stage: 'plan',
        cloudConsent: false,
        sourceRunId: 'run-7',
      });
    });
  });
});

describe('Plan setup when the source run cannot be used', () => {
  it("RF-1105 another user's run id shows the not-found error and no brief", async () => {
    window.history.pushState({}, '', '/projects/p-1/plan-setup?run=run-9');
    renderPlan({ [`GET ${base}/plan-source`]: failure(404, 'RST-2003') });

    expect((await screen.findByTestId('error-banner')).textContent).toContain('RST-2003');
    expect(screen.queryByRole('region', { name: 'Plan estimate' })).toBeNull();
  });

  it('RST-1802 a project with no usable run says so and keeps the page; the package cannot be written', async () => {
    renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-source`]: failure(409, 'RST-1802'),
      [`GET ${base}/plan-estimate`]: failure(409, 'RST-1802'),
    });
    await screen.findByRole('heading', { name: 'Plan setup', level: 1 });

    const region = await screen.findByRole('region', { name: 'Source run' });
    expect(within(region).getByTestId('error-banner').textContent).toContain('RST-1802');
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /^Start the plan/u });
      expect(button).toHaveProperty('disabled', true);
    });
  });
});

describe('Plan setup details', () => {
  it('RF-614 an empty ?run= is no run: the newest completed one is asked for', async () => {
    window.history.pushState({}, '', '/projects/p-1/plan-setup?run=');
    const page = renderPlan();
    await ready();

    expect(pathsOf(page.calls)).toContain(`${base}/plan-source`);
  });

  it('RF-614 a run that does not say when it ended is named without a date', async () => {
    renderPlan({ [`GET ${base}/plan-source`]: json(200, { ...planSource, endedAt: null }) });
    await ready();

    expect(source().textContent).toContain('20261012-090000-understand. Areas');
  });

  it('RF-614 a run with no area says none is named', async () => {
    renderPlan({ [`GET ${base}/plan-source`]: json(200, { ...planSource, areas: [] }) });
    await ready();

    expect(source().textContent).toContain('Areas: none named');
  });

  it('RST-1802 without a usable run nothing asks for a run: no run id is sent', async () => {
    const page = renderPlan({
      [`GET ${base}/plan-source`]: failure(409, 'RST-1802'),
      [`GET ${base}/plan-estimate`]: failure(409, 'RST-1802'),
    });
    await screen.findByRole('region', { name: 'Source run' });
    await screen.findByRole('heading', { name: 'Plan setup', level: 1 });
    press('Save and continue');
    await screen.findByRole('heading', { name: /Which architecture/u, level: 2 });

    await waitFor(() => {
      expect(page.calls.find((call) => call.path === `${base}/plan-options`)?.body).toEqual({
        cloudConsent: false,
      });
    });
    expect(pathsOf(page.calls).filter((path) => path.includes('?run='))).toEqual([]);
  });
});

describe('Plan setup with a named run that cannot be used', () => {
  const named = (): ReturnType<typeof renderPlan> => {
    window.history.pushState({}, '', '/projects/p-1/plan-setup?run=run-7');
    return renderPlan({
      ...savedAnswers,
      [`GET ${base}/plan-source`]: failure(409, 'RST-1802'),
      [`POST ${base}/runs`]: json(202, startedPlanRun),
    });
  };

  it('RST-1802 keeps the named run id on the estimate and blocks Start the plan', async () => {
    const page = named();
    await screen.findByRole('region', { name: 'Source run' });
    await screen.findByRole('heading', { name: 'Plan setup', level: 1 });

    await waitFor(() => {
      expect(pathsOf(page.calls)).toContain(`${base}/plan-estimate?run=run-7`);
    });
    const button = screen.getByRole('button', { name: /^Start the plan/u });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(page.calls.some((call) => call.method === 'POST' && call.path === `${base}/runs`)).toBe(
      false,
    );
  });
});
