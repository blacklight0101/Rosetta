import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import {
  cloudEstimate,
  cloudProject,
  localProject,
  planEstimate,
  savedBrief,
  startedPlanRun,
} from './plan-setup-fixtures.js';
import { base, ready, renderPlan } from './plan-setup-helpers.js';
import { projectOf } from './project-fixtures.js';

// RF-132, RF-143, DEC-148: Plan setup asks the second confirmation for an uploaded project whose
// planner is a cloud provider: it holds the options of the planner and "Start the plan" until
// the box is ticked, sends it with both requests, and offers the switch to Ollama. A GitHub
// project is never asked.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const noticeName = /Your code is private/u;
const privateBox = /^I understand that my own code from OrderDesk/u;
const consentBox = /I understand; send masked excerpts/u;
const uploadCloud = projectOf('p-1', 'OrderDesk', {
  sourceKind: 'upload',
  sourceUrl: '',
  settings: cloudProject['settings'],
});
const saved = { [`GET ${base}/planning-brief`]: json(200, savedBrief) };
const optionsCalls = (page: ReturnType<typeof renderPlan>): unknown[] =>
  page.calls.filter((call) => call.path === `${base}/plan-options`).map((call) => call.body);
const write = (): HTMLButtonElement => {
  const button = screen.getByRole('button', { name: /^Start the plan/u });
  if (!(button instanceof HTMLButtonElement)) throw new Error('Not a button.');
  return button;
};

describe('Plan setup and the private code of an upload', () => {
  it('RF-132 shows the second notice and keeps Start the plan off until both boxes are ticked', async () => {
    renderPlan({
      ...saved,
      [`GET ${base}`]: json(200, uploadCloud),
      [`GET ${base}/plan-estimate`]: json(200, cloudEstimate),
    });
    await ready();

    expect(screen.getByRole('region', { name: noticeName }).textContent).toContain('OrderDesk');
    fireEvent.click(screen.getByRole('checkbox', { name: consentBox }));
    expect(write().disabled).toBe(true);
    expect(write().title).toContain('private code');
    fireEvent.click(screen.getByRole('checkbox', { name: privateBox }));
    expect(write().disabled).toBe(false);
  });

  it('RF-132 sends the confirmation with the run', async () => {
    const page = renderPlan({
      ...saved,
      [`GET ${base}`]: json(200, uploadCloud),
      [`GET ${base}/plan-estimate`]: json(200, cloudEstimate),
      [`POST ${base}/runs`]: json(202, startedPlanRun),
    });
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: consentBox }));
    fireEvent.click(screen.getByRole('checkbox', { name: privateBox }));

    fireEvent.click(write());

    await waitFor(() => {
      expect(page.calls.some((call) => call.path === `${base}/runs`)).toBe(true);
    });
    expect(page.calls.find((call) => call.path === `${base}/runs`)?.body).toEqual({
      ...{ stage: 'plan', cloudConsent: true },
      ...{ privateCodeConfirmed: true, sourceRunId: 'run-1' },
    });
  });
});

describe('Plan setup and the options of a planner in the cloud', () => {
  it('RF-132 asks the planner for options only after both confirmations', async () => {
    const page = renderPlan({ [`GET ${base}`]: json(200, uploadCloud) });
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Architecture' }));
    await screen.findByRole('heading', { name: /Which architecture/u, level: 2 });

    fireEvent.click(screen.getByRole('checkbox', { name: consentBox }));
    expect(optionsCalls(page)).toEqual([]);
    fireEvent.click(screen.getByRole('checkbox', { name: privateBox }));

    await screen.findByRole('radio', { name: /Modular monolith/u });
    expect(optionsCalls(page)).toEqual([
      { cloudConsent: true, privateCodeConfirmed: true, sourceRunId: 'run-1' },
    ]);
  });
});

describe('Plan setup where no second confirmation is asked', () => {
  it('RF-132 a GitHub project with a cloud planner shows no second notice', async () => {
    renderPlan({
      [`GET ${base}`]: json(200, cloudProject),
      [`GET ${base}/plan-estimate`]: json(200, cloudEstimate),
    });
    await ready();

    expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
  });

  it('RF-132 an uploaded project with a local planner shows neither notice', async () => {
    const local = projectOf('p-1', 'OrderDesk', {
      sourceKind: 'upload',
      sourceUrl: '',
      settings: localProject['settings'],
    });
    renderPlan({
      [`GET ${base}`]: json(200, local),
      [`GET ${base}/plan-estimate`]: json(200, planEstimate),
    });
    await ready();

    expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
    expect(screen.queryByText(/Code will leave this machine/u)).toBeNull();
  });
});
