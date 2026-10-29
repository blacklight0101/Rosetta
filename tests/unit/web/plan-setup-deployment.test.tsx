import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { press, ready, renderPlan, saves, stepName } from './plan-setup-helpers.js';

// P6-26, RF-611, RF-643, DEC-189: the hosted question on the project context step.

async function openContext(): Promise<HTMLElement> {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Project context' }));
  await waitFor(() => {
    expect(stepName()).toBe('Project context');
  });
  return screen.getByRole('radiogroup', { name: 'Will the new application be hosted?' });
}

describe('the hosted question', () => {
  it('P6-26 is a radio group with a legend, three answers, none chosen and none recommended', async () => {
    renderPlan();
    const group = await openContext();

    expect(group.tagName).toBe('FIELDSET');
    expect(group.querySelector('legend')?.textContent).toBe('Will the new application be hosted?');
    const radios = within(group).getAllByRole<HTMLInputElement>('radio');
    expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual([
      'Hosted',
      'Not hosted',
      'Not stated',
    ]);
    expect(radios.some((radio) => radio.checked)).toBe(false);
    expect(group.textContent).not.toMatch(/Recommended/u);
  });

  it('P6-26 hosted is sent as context.deployment and shown in What I recorded', async () => {
    const page = renderPlan();
    const group = await openContext();

    fireEvent.click(within(group).getByRole('radio', { name: 'Hosted' }));
    expect(screen.getByRole('region', { name: 'What I recorded' }).textContent).toContain(
      'will be hosted',
    );
    press('Save and continue');

    await screen.findByRole('heading', { name: /Will agents or people build/u, level: 2 });
    expect(saves(page)).toEqual([{ context: { deployment: 'hosted' } }]);
  });

  it('P6-26 not stated sends nothing, after hosted was chosen', async () => {
    const page = renderPlan();
    const group = await openContext();

    fireEvent.click(within(group).getByRole('radio', { name: 'Hosted' }));
    fireEvent.click(within(group).getByRole('radio', { name: 'Not stated' }));
    fireEvent.input(screen.getByLabelText('Team size'), { target: { value: '6' } });
    press('Save and continue');

    await screen.findByRole('heading', { name: /Will agents or people build/u, level: 2 });
    expect(saves(page)).toEqual([
      { context: { teamSize: 6 }, chosen: { 'context.teamSize': 'typed' } },
    ]);
  });
});
