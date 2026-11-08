import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { cloudEstimate, cloudProject, planEstimate, savedBrief } from './plan-setup-fixtures.js';
import { base, ready, renderPlan } from './plan-setup-helpers.js';
import { projectOf } from './project-fixtures.js';

// RF-605, P8-82, DEC-209: the layout of Plan setup. "Switch every role to Ollama" sits in the roles
// summary, away from the consent boxes and the start button; the likely estimate and "Start the
// plan" sit in a bar that stays at the bottom of the window, like the start page's summary bar.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const saved = { [`GET ${base}/planning-brief`]: json(200, savedBrief) };
const uploadCloud = projectOf('p-1', 'OrderDesk', {
  sourceKind: 'upload',
  sourceUrl: '',
  settings: cloudProject['settings'],
});
const roles = (): HTMLElement => screen.getByRole('region', { name: 'Roles' });
const bar = (): HTMLElement => screen.getByRole('region', { name: 'Plan summary' });
const switchName = /^Switch every role to Ollama/u;

describe('Plan setup roles summary', () => {
  it('RF-605 names each role with its provider and model', async () => {
    renderPlan({
      ...saved,
      [`GET ${base}`]: json(200, cloudProject),
      [`GET ${base}/plan-estimate`]: json(200, cloudEstimate),
    });
    await ready();

    const text = roles().textContent;
    for (const role of ['Reader', 'Verifier', 'Planner', 'Summariser']) {
      expect(text).toContain(role);
    }
    expect(text).toContain('Anthropic');
    expect(text).toContain('claude-sonnet');
    expect(text).toContain('gemma4:e4b');
  });
});

describe('Plan setup Ollama switch', () => {
  it('RF-605 the Ollama switch sits in the roles summary, not beside the consents', async () => {
    renderPlan({
      ...saved,
      [`GET ${base}`]: json(200, uploadCloud),
      [`GET ${base}/plan-estimate`]: json(200, cloudEstimate),
    });
    await ready();

    expect(screen.getAllByRole('button', { name: switchName })).toHaveLength(1);
    expect(within(roles()).getByRole('button', { name: switchName })).toBeTruthy();
    const notice = screen.getByRole('region', { name: /Your code is private/u });
    expect(within(notice).queryByRole('button', { name: switchName })).toBeNull();
    expect(within(bar()).queryByRole('button', { name: switchName })).toBeNull();
  });

  it('RF-605 the switch saves every role on Ollama from the roles summary', async () => {
    const page = renderPlan({
      ...saved,
      [`GET ${base}`]: json(200, uploadCloud),
      [`GET ${base}/plan-estimate`]: json(200, cloudEstimate),
      [`PUT ${base}/settings`]: json(200, { ...uploadCloud, settingsVersion: 2 }),
    });
    await ready();

    fireEvent.click(within(roles()).getByRole('button', { name: switchName }));

    await waitFor(() => {
      expect(
        page.calls.some((call) => call.method === 'PUT' && call.path === `${base}/settings`),
      ).toBe(true);
    });
    const put = page.calls.find((call) => call.path === `${base}/settings`);
    expect(JSON.stringify(put?.body)).not.toContain('"provider":"anthropic"');
  });

  it('RF-605 a project whose private code is not asked shows the roles without the switch', async () => {
    renderPlan({
      ...saved,
      [`GET ${base}`]: json(200, cloudProject),
      [`GET ${base}/plan-estimate`]: json(200, cloudEstimate),
    });
    await ready();

    expect(screen.queryByRole('button', { name: switchName })).toBeNull();
  });
});

describe('Plan setup bar at the bottom of the window', () => {
  it('RF-605 the bar holds the likely estimate and Start the plan', async () => {
    renderPlan(saved);
    await ready();

    expect(bar().textContent).toContain('Plan estimate: likely $0.1800');
    expect(within(bar()).getByRole('button', { name: /^Start the plan/u })).toBeTruthy();
    const card = screen.getByRole('region', { name: 'Plan estimate' });
    expect(within(card).queryByRole('button', { name: /^Start the plan/u })).toBeNull();
  });

  it('RF-605 the bar names what is left of the approved amount when the plan runs under one', async () => {
    const approvedCap = {
      ...planEstimate.caps[0],
      approved: true,
      limit: '4000000',
      remaining: '3810000',
    };
    renderPlan({
      ...saved,
      [`GET ${base}/plan-estimate`]: json(200, {
        ...planEstimate,
        runLine: 'journey',
        caps: [approvedCap],
      }),
    });
    await ready();

    expect(bar().textContent).toContain('$3.81 left of $4.00 approved');
  });

  it('RF-605 the bar says why Start the plan cannot be pressed yet', async () => {
    renderPlan();
    await ready();

    expect(bar().textContent).toContain('Finish the steps first');
    const button = within(bar()).getByRole('button', { name: /^Start the plan/u });
    expect(button).toHaveProperty('disabled', true);
  });
});
