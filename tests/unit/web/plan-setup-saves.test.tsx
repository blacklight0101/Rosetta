import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { savedBrief } from './plan-setup-fixtures.js';
import { base, press, ready, renderPlan, saves, stepName } from './plan-setup-helpers.js';

// RF-605, RF-611, P6-33: the saving of the planning brief by the Plan setup page (use-plan-setup.ts).
// A failed save shows the error, keeps the step and what was answered, and a later save goes through;
// two saves in a row each send the draft as it was when they started and move on one step.

const put = `PUT ${base}/planning-brief`;

async function openMigration(): Promise<void> {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Migration' }));
  await waitFor(() => {
    expect(stepName()).toBe('Migration');
  });
}

describe('saving the planning brief', () => {
  it('RF-605 a failed save shows the error, stays on the step and keeps the answer', async () => {
    let calls = 0;
    const page = renderPlan({
      [put]: () => {
        calls += 1;
        return calls === 1 ? failure(500, 'RST-9000') : json(200, savedBrief);
      },
    });
    await openMigration();
    const parallel = screen.getByRole('radio', { name: /Parallel Change/u });
    fireEvent.click(parallel);

    press('Save and continue');

    const banner = await screen.findByTestId('error-banner');
    expect(banner.textContent).toContain('Message of RST-9000.');
    expect(stepName()).toBe('Migration');
    expect(screen.getByRole('radio', { name: /Parallel Change/u })).toHaveProperty('checked', true);

    press('Save and continue');

    await waitFor(() => {
      expect(stepName()).toBe('Stack');
    });
    expect(saves(page)).toEqual([
      { migration: 'parallel-change', chosen: { migration: 'parallel-change' } },
      { migration: 'parallel-change', chosen: { migration: 'parallel-change' } },
    ]);
    expect(screen.queryByTestId('error-banner')).toBeNull();
  });

  it('RF-605 two saves in a row move one step each and send the draft each time', async () => {
    const page = renderPlan();
    await openMigration();
    fireEvent.click(screen.getByRole('radio', { name: /Parallel Change/u }));

    press('Save and continue');
    await waitFor(() => {
      expect(stepName()).toBe('Stack');
    });
    press('Save and continue');
    await waitFor(() => {
      expect(stepName()).toBe('Project context');
    });

    const sent = saves(page);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({
      migration: 'parallel-change',
      chosen: { migration: 'parallel-change' },
    });
    expect(sent[1]).toMatchObject({ migration: 'parallel-change' });
  });
});
