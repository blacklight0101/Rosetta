import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { runUuid } from './live-run-helpers.js';
import { openEnded, question } from './ended-run-helpers.js';

// RF-614, RF-1017, RF-1015, RF-006, RST-1802: the "Your turn" panel of an understand run that ended
// Completed with a Supported claim offers "Set up the plan" (after "Answer questions" when questions
// are open); a run that stopped offers Resume instead and no plan.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });
const setUp = (): HTMLElement => within(turn()).getByRole('button', { name: 'Set up the plan' });

it('RF-614 a completed run with a Supported claim offers Set up the plan, which opens Plan setup for that run', async () => {
  await openEnded({ judged: 'Supported', questions: [] });

  await waitFor(() => {
    expect(setUp()).toBeTruthy();
  });
  fireEvent.click(setUp());

  expect(window.location.pathname + window.location.search).toBe(
    `/projects/p-1/plan-setup?run=${runUuid}`,
  );
});

it('RF-614 Set up the plan is the main action when no question is open', async () => {
  await openEnded({ judged: 'Supported', questions: [] });

  await waitFor(() => {
    expect(setUp().className).toContain('rst-button--primary');
  });
});

it('RF-614 Answer questions comes first and stays the main action while questions are open', async () => {
  await openEnded({ judged: 'Supported', questions: [question(1), question(2)] });

  await waitFor(() => {
    expect(within(turn()).getByRole('button', { name: 'Answer 2 questions' })).toBeTruthy();
  });
  const buttons = within(turn()).getAllByRole('button');
  const names = buttons.map((button) => button.textContent);
  expect(names.indexOf('Answer 2 questions')).toBeLessThan(names.indexOf('Set up the plan'));
  expect(setUp().className).not.toContain('rst-button--primary');
  expect(
    within(turn()).getByRole('button', { name: 'Answer 2 questions' }).className,
  ).toContain('rst-button--primary');
});

it('RST-1802 a completed run with no Supported claim offers no plan and says why', async () => {
  await openEnded({ judged: 'Rejected', questions: [] });

  await waitFor(() => {
    expect(turn().textContent).toContain('no Supported claim');
  });
  expect(within(turn()).queryByRole('button', { name: 'Set up the plan' })).toBeNull();
});

it.each(['CapReached', 'Failed', 'Interrupted'] as const)(
  'RF-614 RF-006 a run that ended %s offers Resume, not Set up the plan',
  async (endState) => {
    await openEnded({ judged: 'Supported', endState, questions: [] });

    await waitFor(() => {
      expect(within(turn()).getByRole('button', { name: 'Resume run' })).toBeTruthy();
    });
    expect(within(turn()).queryByRole('button', { name: 'Set up the plan' })).toBeNull();
    expect(turn().textContent).toContain('plan');
  },
);
