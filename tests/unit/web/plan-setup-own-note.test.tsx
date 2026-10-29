import { screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { unsavedBrief } from './plan-setup-fixtures.js';
import { base, ready, renderPlan } from './plan-setup-helpers.js';

// RF-645, DEC-184: the note on a typed answer in "What I recorded" follows the saved brief. A typed
// question the brief no longer lists as defaulted reaches the planner; one a brief saved before
// P6-21 still lists there does not, until the brief is saved again.

const NOTE = 'Recorded; the planner reads it as your own answer';
const OLD_NOTE = 'Recorded; the plan uses the default until you save the brief again';

function briefWith(defaulted: readonly string[]) {
  return {
    ...unsavedBrief,
    saved: true,
    brief: {
      ...unsavedBrief.brief,
      savedAt: '2026-10-29T09:00:00.000Z',
      defaulted,
      chosen: { migration: 'typed' },
      typed: { migration: 'Move one module a week.' },
    },
  };
}

describe('the note on a typed answer', () => {
  it('RF-645 DEC-184 a typed answer no longer defaulted says the planner reads it', async () => {
    const defaulted = unsavedBrief.brief.defaulted.filter((id) => id !== 'migration');
    renderPlan({ [`GET ${base}/planning-brief`]: json(200, briefWith(defaulted)) });
    await ready();

    const summary = screen.getByRole('region', { name: 'What I recorded' });
    expect(within(summary).getByText(new RegExp(NOTE, 'u'))).not.toBeNull();
    expect(within(summary).queryByText(new RegExp(OLD_NOTE, 'u'))).toBeNull();
  });

  it('RF-645 DEC-184 a typed answer still defaulted says the default applies until saved again', async () => {
    renderPlan({
      [`GET ${base}/planning-brief`]: json(200, briefWith(unsavedBrief.brief.defaulted)),
    });
    await ready();

    const summary = screen.getByRole('region', { name: 'What I recorded' });
    expect(within(summary).getByText(new RegExp(OLD_NOTE, 'u'))).not.toBeNull();
    expect(within(summary).queryByText(new RegExp(NOTE, 'u'))).toBeNull();
  });
});
