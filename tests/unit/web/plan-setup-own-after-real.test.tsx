import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { press, ready, renderPlan, saves, stepName } from './plan-setup-helpers.js';

// RF-645, P6-16: a real architecture answer, then an own one, saves the own one only.

const own = (): HTMLElement => screen.getByRole('radio', { name: /^Type your own answer/u });

async function openStep(name: string): Promise<void> {
  await ready();
  fireEvent.click(screen.getByRole('button', { name }));
  await waitFor(() => {
    expect(stepName()).toBe(name);
  });
}

describe('the architecture question: a real answer, then an own one', () => {
  it('RF-645 P6-16 choosing a style and then typing an own answer sends no chosen style, only the proposal', async () => {
    const page = renderPlan();
    await openStep('Architecture');

    await screen.findByRole('radio', { name: /\(Recommended\)/u });
    const [, second] = screen.getAllByRole('radio');
    fireEvent.click(second ?? own());
    expect(second).toHaveProperty('checked', true);
    fireEvent.click(own());
    fireEvent.input(screen.getByLabelText('Your answer'), {
      target: { value: 'Keep the portal and add an API beside it.' },
    });
    press('Save and continue');

    await waitFor(() => {
      expect(saves(page)).toHaveLength(1);
    });
    expect(saves(page)).toEqual([
      {
        architecture: {
          style: 'modular-monolith',
          recommended: ['modular-monolith', 'hexagonal'],
          evidence: ['BR-001'],
        },
        chosen: { architecture: 'typed' },
        typed: { architecture: 'Keep the portal and add an API beside it.' },
      },
    ]);
  });
});
