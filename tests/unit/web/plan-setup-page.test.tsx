import { fireEvent, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { savedBrief } from './plan-setup-fixtures.js';
import { base, press, ready, renderPlan, saves, stepName } from './plan-setup-helpers.js';

// RF-605, RF-606, RF-610, RF-611, RF-612: the interview of Plan setup, one group of questions at a
// time, each with its default and the reason it matters, saved as the planning brief.

describe('plan setup interview', () => {
  it('RF-605 shows the six steps and opens on the principles with the reason and the default', async () => {
    renderPlan();
    await ready();

    const steps = screen.getByRole('navigation', { name: 'Steps' });
    const names = within(steps)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(names).toEqual([
      'Principles',
      'Architecture',
      'Migration',
      'Stack',
      'Project context',
      'Build method',
    ]);
    expect(stepName()).toBe('Principles');
    expect(screen.getByRole('heading', { name: /Which principles/u, level: 2 })).not.toBeNull();
    expect(screen.getByText(/Each one you keep becomes rules/u)).not.toBeNull();
    expect(screen.getByText('Default: the 3 recommended principles are on.')).not.toBeNull();
  });

  it('RF-606 lists the catalogue by group with its rule, and marks the defaults (Recommended)', async () => {
    renderPlan();
    await ready();

    expect(screen.getByRole('group', { name: 'Design principles' })).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Method' })).not.toBeNull();
    expect(screen.queryByText('Layered (N-tier)')).toBeNull();
    const solid = screen.getByRole('checkbox', { name: /SOLID/u });
    expect(solid.hasAttribute('checked') || (solid as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: /SOLID \(Recommended\)/u })).not.toBeNull();
    expect(screen.getByRole('checkbox', { name: /^Design patterns/u })).toHaveProperty(
      'checked',
      false,
    );
    expect(screen.getByText('Rule of SOLID.')).not.toBeNull();
  });
});

describe('plan setup saving', () => {
  it('RF-605 sends only the answered parts and moves on', async () => {
    const page = renderPlan();
    await ready();

    fireEvent.click(screen.getByRole('checkbox', { name: /^KISS/u }));
    press('Save and continue');

    await screen.findByRole('heading', { name: /Which architecture/u, level: 2 });
    expect(saves(page)).toEqual([{ principles: ['solid', 'tdd'] }]);
    expect(stepName()).toBe('Architecture');
  });

  it('RF-605 takes the defaults for the rest and saves nothing as answered', async () => {
    const page = renderPlan();
    await ready();

    press('Use the defaults for the rest');

    const summary = await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([{}]);
    expect(within(summary).getAllByText('(default)').length).toBeGreaterThan(0);
    expect(within(summary).getByText('Strangler Fig')).not.toBeNull();
    expect(within(summary).getByText('without AI-assisted build')).not.toBeNull();
  });

  it('RF-605 shows what was recorded, edits it and saves again', async () => {
    const page = renderPlan({ [`GET ${base}/planning-brief`]: json(200, savedBrief) });
    await ready();

    const summary = screen.getByRole('region', { name: 'What I recorded' });
    expect(within(summary).queryByText('(default)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Principles' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Design patterns/u }));
    press('Save and continue');

    await screen.findByRole('heading', { name: /Which architecture/u, level: 2 });
    expect(saves(page)[0]).toMatchObject({
      principles: ['solid', 'kiss', 'design-patterns', 'tdd'],
    });
  });
});

describe('plan setup navigation', () => {
  it('RF-605 goes back without losing the answers', async () => {
    renderPlan();
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: /^KISS/u }));
    press('Save and continue');
    await screen.findByRole('heading', { name: /Which architecture/u, level: 2 });

    press('Back');

    expect(stepName()).toBe('Principles');
    expect(screen.getByRole('checkbox', { name: /^KISS/u })).toHaveProperty('checked', false);
  });

  it('RF-605 says why a save was refused and keeps the step', async () => {
    renderPlan({ [`PUT ${base}/planning-brief`]: failure(400, 'RST-2000') });
    await ready();

    press('Save and continue');

    expect((await screen.findByTestId('error-banner')).textContent).toContain('RST-2000');
    expect(stepName()).toBe('Principles');
  });

  it('RF-605 shows the error of a project that is not the user own', async () => {
    renderPlan({ [`GET ${base}/planning-brief`]: failure(404, 'RST-2003') });

    expect((await screen.findByTestId('error-banner')).textContent).toContain('RST-2003');
    expect(screen.queryByRole('region', { name: 'What I recorded' })).toBeNull();
  });
});
