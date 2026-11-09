import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import type { RunPhase } from '../../../web/src/lib/live-run/run-phase.js';
import { RunStatusBar } from '../../../web/src/pages/RunStatusBar.js';

// RF-1002, RNF-010 (P3-62, owner test 2026-10-20): the head of the run page. "Start page" is part of
// the title group, not a floating item between the title and the buttons.

const bar = (phase: RunPhase) =>
  render(
    <RunStatusBar
      {...{ phase, title: 'Understand, running', projectId: 'p-1' }}
      runKey="20261012-100000-understand"
      {...{ stopping: false, busy: false, stopError: undefined, onStop: () => undefined }}
    />,
  );

describe('RF-1002 the head of the run page', () => {
  it.each([
    { kind: 'running' },
    { kind: 'queued' },
    { kind: 'ended', endState: 'Completed' },
  ] as const)(
    'RF-1002 keeps "Start page" with the title of a $kind run, and not with the buttons',
    (phase) => {
      bar(phase);

      const link = screen.getByRole('link', { name: 'Start page' });
      const title = screen.getByRole('heading', { name: 'Understand, running' });
      expect(link.getAttribute('href')).toBe('/projects/p-1');
      expect(link.parentElement).toBe(title.parentElement);
      expect(link.closest('.rst-live-pause-actions')).toBeNull();
    },
  );

  it('RF-1002 names the end state of an ended run on its status, so a test can tell Completed from stopped early', () => {
    // P8-138: "Partly read: 67% of your code" reads the same for a Completed run and a CapReached one.
    bar({ kind: 'ended', endState: 'CapReached' });

    expect(screen.getByTestId('run-status').dataset['endState']).toBe('CapReached');
  });

  it('RF-1002 names no end state while the run is running', () => {
    bar({ kind: 'running' });

    expect(screen.getByTestId('run-status').dataset['endState']).toBeUndefined();
  });

  it('RF-1002 keeps the run key in the same title group', () => {
    bar({ kind: 'running' });

    const title = screen.getByRole('heading', { name: 'Understand, running' });
    expect(title.parentElement?.textContent).toContain('20261012-100000-understand');
  });
});
