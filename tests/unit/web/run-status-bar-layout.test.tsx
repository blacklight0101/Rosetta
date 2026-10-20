import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import type { RunPhase } from '../../../web/src/lib/live-run/run-phase.js';
import { RunStatusBar } from '../../../web/src/pages/RunStatusBar.js';

// RF-1002, RNF-010 (P3-62, owner test 2026-10-20): the head of the run page. "Start page" is part of
// the title group, not a floating item between the title and the buttons.

const bar = (phase: RunPhase) =>
  render(
    <RunStatusBar
      {...{ phase, runKey: '20261012-100000-understand', stage: 'understand', projectId: 'p-1' }}
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
      const title = screen.getByRole('heading', { name: 'Live run' });
      expect(link.getAttribute('href')).toBe('/projects/p-1/start');
      expect(link.parentElement).toBe(title.parentElement);
      expect(link.closest('.rst-live-pause-actions')).toBeNull();
    },
  );

  it('RF-1002 keeps the run key and the stage in the same title group', () => {
    bar({ kind: 'running' });

    const title = screen.getByRole('heading', { name: 'Live run' });
    expect(title.parentElement?.textContent).toContain('20261012-100000-understand');
    expect(title.parentElement?.textContent).toContain('understand');
  });
});
