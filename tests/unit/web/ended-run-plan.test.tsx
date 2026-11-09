import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { runUuid } from './live-run-helpers.js';
import { openEnded, question } from './ended-run-helpers.js';

// RF-614, RF-1017, RF-1015, RF-006, RST-1802: the "Your turn" panel of an understand run that ended
// Completed with a Supported claim offers "Set up the plan" as its one primary button, with "Answer the
// questions first" as a link under it while questions are open (RF-1021, P8-84); a run that stopped
// offers Resume instead and no plan.

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

it('RF-614 RF-1021 Set up the plan stays the one primary action while questions are open, with Answer the questions first as a link under it', async () => {
  await openEnded({ judged: 'Supported', questions: [question(1), question(2)] });

  await waitFor(() => {
    expect(setUp().className).toContain('rst-button--primary');
  });
  const answer = within(turn()).getByRole('button', { name: 'Answer the 2 questions first' });
  expect(answer.className).toContain('rst-button--link');
  expect(setUp().compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('RST-1802 a completed run with no Supported claim offers no plan and says why', async () => {
  await openEnded({ judged: 'Rejected', questions: [] });

  await waitFor(() => {
    expect(turn().textContent).toContain('no Supported claim');
  });
  expect(within(turn()).queryByRole('button', { name: 'Set up the plan' })).toBeNull();
});

it('RF-614 P3-121 RF-1021 a run that ended CapReached with a Supported claim offers Set up the plan as a link beside Resume', async () => {
  await openEnded({ judged: 'Supported', endState: 'CapReached', questions: [] });

  await waitFor(() => {
    expect(setUp()).toBeTruthy();
  });
  // RF-1021 (P8-84): Resume in the head is the page's one primary action, so the plan is a link.
  expect(setUp().className).toContain('rst-button--link');
  expect(turn().textContent).toContain('stopped at a cap');
  expect(screen.getAllByRole('button', { name: 'Resume run' })).toHaveLength(1);
  fireEvent.click(setUp());
  expect(window.location.pathname + window.location.search).toBe(
    `/projects/p-1/plan-setup?run=${runUuid}`,
  );
});

it('RST-1802 a run that ended CapReached with no Supported claim offers no plan', async () => {
  await openEnded({ judged: 'Rejected', endState: 'CapReached', questions: [] });

  await waitFor(() => {
    expect(turn().textContent).toContain('stopped at its cap');
  });
  expect(within(turn()).queryByRole('button', { name: 'Set up the plan' })).toBeNull();
});

it.each(['Failed', 'Interrupted'] as const)(
  'RF-614 RF-006 a run that ended %s offers Resume, not Set up the plan',
  async (endState) => {
    await openEnded({ judged: 'Supported', endState, questions: [] });

    await waitFor(() => {
      expect(turn().textContent).toContain('Resume it');
    });
    expect(screen.getAllByRole('button', { name: 'Resume run' })).toHaveLength(1);
    expect(within(turn()).queryByRole('button', { name: 'Set up the plan' })).toBeNull();
    expect(turn().textContent).toContain('plan');
  },
);
