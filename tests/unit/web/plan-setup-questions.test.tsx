import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { press, ready, renderPlan, saves, stepName } from './plan-setup-helpers.js';

// RF-610, RF-611, RF-612: the migration, project context and build method steps.

async function openStep(name: string): Promise<void> {
  await ready();
  fireEvent.click(screen.getByRole('button', { name }));
  await waitFor(() => {
    expect(stepName()).toBe(name);
  });
}

describe('migration step', () => {
  it('RF-610 offers the three strategies with Strangler Fig as the recommended default', async () => {
    const page = renderPlan();
    await openStep('Migration');

    expect(screen.getByRole('radio', { name: /Strangler Fig \(Recommended\)/u })).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.getByRole('radio', { name: /Parallel Change/u })).not.toBeNull();
    expect(screen.getByRole('radio', { name: /Full rewrite/u })).not.toBeNull();
    expect(screen.getByText('Risky, clean.')).not.toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Parallel Change/u }));
    press('Save and continue');

    await screen.findByRole('heading', { name: /Which technology/u, level: 2 });
    expect(saves(page)).toEqual([{ migration: 'parallel-change' }]);
  });
});

describe('project context step', () => {
  it('RF-611 asks the optional questions and sends only those answered', async () => {
    const page = renderPlan();
    await openStep('Project context');

    expect(screen.getByText(/All of these are optional/u)).not.toBeNull();
    fireEvent.input(screen.getByLabelText('Team size'), { target: { value: '6' } });
    fireEvent.input(screen.getByLabelText('Integrations that must stay'), {
      target: { value: 'SAP\nActive Directory' },
    });
    press('Save and continue');

    await screen.findByRole('heading', { name: /Will the team build/u, level: 2 });
    expect(saves(page)).toEqual([
      {
        context: {
          teamSize: 6,
          keepIntegrations: ['SAP', 'Active Directory'],
        },
      },
    ]);
  });

  it('RF-611 refuses a team size that is not a whole number before any save', async () => {
    const page = renderPlan();
    await openStep('Project context');

    fireEvent.input(screen.getByLabelText('Team size'), { target: { value: 'many' } });
    press('Save and continue');

    expect(await screen.findByText(/Use a whole number from 1 to 10000/u)).not.toBeNull();
    expect(saves(page)).toEqual([]);
  });
});

describe('build method step', () => {
  it('RF-612 records an AI-assisted build and finishes the steps', async () => {
    const page = renderPlan();
    await openStep('Build method');

    expect(screen.getByRole('checkbox', { name: /AI agents/u })).toHaveProperty('checked', false);
    fireEvent.click(screen.getByRole('checkbox', { name: /AI agents/u }));
    press('Save');

    const summary = await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([{ buildMethod: { aiAssisted: true } }]);
    expect(within(summary).getByText('with AI-assisted build')).not.toBeNull();
  });
});
