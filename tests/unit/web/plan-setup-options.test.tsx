import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { cloudProject } from './plan-setup-fixtures.js';
import { base, press, ready, renderPlan, saves } from './plan-setup-helpers.js';

// RF-608, RF-609, RF-143: the architecture and stack steps ask the planner for two options each,
// grounded in the code map and the verified cards; a cloud planner waits for the consent.

const optionsCalls = (page: ReturnType<typeof renderPlan>): unknown[] =>
  page.calls.filter((call) => call.path === `${base}/plan-options`).map((call) => call.body);

async function openArchitecture(page = renderPlan()) {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Architecture' }));
  await screen.findByRole('heading', { name: /Which architecture/u, level: 2 });
  return page;
}

describe('architecture step', () => {
  it('RF-608 proposes two styles with trade-offs and evidence and marks one (Recommended)', async () => {
    const page = await openArchitecture();

    const recommended = await screen.findByRole('radio', {
      name: /Modular monolith.*\(Recommended\)/u,
    });
    expect(recommended).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: /Hexagonal/u })).toHaveProperty('checked', false);
    expect(screen.getByText('One deployable unit')).not.toBeNull();
    expect(screen.getByText('Modules must be policed')).not.toBeNull();
    expect(screen.getByText('BR-001')).not.toBeNull();
    expect(optionsCalls(page)).toEqual([{ cloudConsent: false, sourceRunId: 'run-1' }]);
  });

  it('RF-608 saves the chosen style with the evidence behind it', async () => {
    const page = await openArchitecture();

    fireEvent.click(await screen.findByRole('radio', { name: /Hexagonal/u }));
    press('Save and continue');

    await screen.findByRole('heading', { name: /How should the team move/u, level: 2 });
    expect(saves(page)).toEqual([
      {
        architecture: {
          style: 'hexagonal',
          recommended: ['modular-monolith', 'hexagonal'],
          evidence: ['FEAT-001'],
        },
        chosen: { architecture: 'hexagonal' },
      },
    ]);
  });

  it('RF-608 lists the other styles of the catalogue below the two proposed', async () => {
    await openArchitecture();

    const others = await screen.findByRole('group', { name: 'Other styles (1)' });
    expect(within(others).getByRole('radio', { name: /Layered/u })).not.toBeNull();
  });
});

describe('architecture step when asking fails', () => {
  it('RF-608 says the options could not be made, offers to ask again and keeps the styles', async () => {
    let calls = 0;
    const page = renderPlan({
      [`POST ${base}/plan-options`]: () =>
        calls++ === 0 ? failure(502, 'RST-1700') : json(200, {}),
    });
    await openArchitecture(page);

    expect((await screen.findByTestId('error-banner')).textContent).toContain('RST-1700');
    expect(screen.getByRole('radio', { name: /Layered/u })).not.toBeNull();
    press('Ask again');

    await waitFor(() => {
      expect(optionsCalls(page)).toHaveLength(2);
    });
  });

  it('RF-143 asks for consent before a cloud planner sees the code and then asks it', async () => {
    const page = renderPlan({ [`GET ${base}`]: json(200, cloudProject) });
    await openArchitecture(page);

    expect(await screen.findByText(/Code will leave this machine/u)).not.toBeNull();
    expect(optionsCalls(page)).toEqual([]);
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand; send masked excerpts/u }));

    await screen.findByRole('radio', { name: /Modular monolith/u });
    expect(optionsCalls(page)).toEqual([{ cloudConsent: true, sourceRunId: 'run-1' }]);
  });
});

describe('stack step', () => {
  it('RF-609 pre-fills two options per layer, closest to the legacy code first, and a field of your own', async () => {
    renderPlan();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Stack' }));

    await screen.findByRole('radio', { name: /^database A/u });
    const layer = screen.getByRole('radiogroup', { name: 'Database' });
    expect(within(layer).getByRole('radio', { name: /^database A/u })).not.toBeNull();
    expect(within(layer).getByRole('radio', { name: /^database B/u })).not.toBeNull();
    expect(within(layer).getByLabelText('Your own for Database')).not.toBeNull();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(7);
  });
});

describe('stack step answers', () => {
  it('RF-609 saves the options picked and the technology typed', async () => {
    const page = renderPlan();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Stack' }));
    await screen.findByRole('radio', { name: /^database B/u });
    const database = screen.getByRole('radiogroup', { name: 'Database' });

    fireEvent.click(within(database).getByRole('radio', { name: /^database B/u }));
    fireEvent.input(screen.getByLabelText('Your own for Hosting'), {
      target: { value: 'On-premises Kubernetes' },
    });
    press('Save and continue');

    await screen.findByRole('heading', { name: /What should the roadmap know/u, level: 2 });
    expect(saves(page)).toEqual([
      {
        stack: [
          {
            layer: 'database',
            choice: 'database B',
            custom: false,
            offered: ['database A', 'database B'],
          },
          {
            layer: 'hosting',
            choice: 'On-premises Kubernetes',
            custom: true,
            offered: ['hosting A', 'hosting B'],
          },
        ],
        chosen: { 'stack.database': 'b', 'stack.hosting': 'typed' },
      },
    ]);
  });

  it('RF-609 leaves the layers unanswered when the options cannot be made', async () => {
    renderPlan({ [`POST ${base}/plan-options`]: failure(409, 'RST-1700') });
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Stack' }));

    expect(await screen.findByTestId('error-banner')).not.toBeNull();
    expect(screen.getByLabelText('Your own for Database')).not.toBeNull();
  });
});
