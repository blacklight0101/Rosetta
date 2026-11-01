import { describe, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { facts, planId, planRun, projectId, source, sourceId, step } from './journey-fixtures.js';

// RF-615 (Q-44): once the brief is saved the questions step is done and the journey moves on, the
// skipped questions keeping their defaults; a plan run that wrote the package but ended RST-1806
// shows the package "Written with gaps" with links to the package and checks.md (RF-627).

const setUp = `/projects/${projectId}/plan-setup?run=${sourceId}`;
const skipped = (count: number) => source({ openQuestions: count });

describe('RF-615 the journey after the brief is saved', () => {
  it('RF-615 a brief saved with 1 question skipped finishes the questions step on its default', () => {
    const view = journeyOf(facts({ source: skipped(1), briefSaved: true }), projectId);

    expect(step(view, 'questions')).toMatchObject({
      state: 'skipped',
      detail: '1 question left on its default',
      href: `/runs/${sourceId}`,
      here: false,
    });
  });

  it('RF-615 several skipped questions read "N questions left on their defaults"', () => {
    const view = journeyOf(facts({ source: skipped(3), briefSaved: true }), projectId);

    expect(step(view, 'questions').detail).toBe('3 questions left on their defaults');
  });

  it('RF-615 the next action moves on to the estimate and no longer asks for the answer', () => {
    const view = journeyOf(facts({ source: skipped(1), briefSaved: true }), projectId);

    expect(view.action).toEqual({ kind: 'link', label: 'Start the plan', href: setUp });
    expect(view.secondary).toBeUndefined();
    expect(step(view, 'estimate')).toMatchObject({ state: 'current', here: true });
  });

  it('RF-615 after a plan ran, one skipped question does not keep "Answer 1 question" current', () => {
    const view = journeyOf(
      facts({
        source: skipped(1),
        plan: planRun(),
        handoff: { runId: planId, runKey: '20261012-103000-plan', outOfDate: false, gaps: false },
      }),
      projectId,
    );

    expect(step(view, 'questions').state).toBe('skipped');
    expect(view.action).toMatchObject({ label: 'Open the package' });
  });

  it('RF-615 without a saved brief the questions are still asked first', () => {
    const view = journeyOf(facts({ source: skipped(1), briefSaved: false }), projectId);

    expect(view.action).toMatchObject({ kind: 'answer', label: 'Answer 1 question' });
    expect(step(view, 'questions').state).toBe('current');
  });
});

describe('RF-627 a plan run that wrote the package and ended RST-1806', () => {
  const gaps = facts({
    plan: planRun({ endState: 'Failed', errorCode: 'RST-1806', costMicros: 31_000 }),
    handoff: { runId: planId, runKey: '20261012-103000-plan', outOfDate: false, gaps: true },
  });

  it('RF-627 reads the package "Written with gaps" and links the package and checks.md', () => {
    const view = journeyOf(gaps, projectId);

    expect(step(view, 'package')).toMatchObject({
      state: 'gaps',
      detail: 'Written with gaps',
      href: `/runs/${planId}`,
      links: [
        { label: 'checks.md', href: `/runs/${planId}/files/handoff/checks.md` },
        { label: 'Download the package', href: `/api/runs/${planId}/handoff.zip` },
      ],
    });
  });

  it('RF-627 names the code on the plan step and offers to try the plan again', () => {
    const view = journeyOf(gaps, projectId);

    expect(step(view, 'plan')).toMatchObject({ state: 'failed', detail: 'Failed (RST-1806)' });
    expect(view.action).toEqual({ kind: 'link', label: 'Try the plan again', href: setUp });
  });

  it('RF-627 never calls the package done or ready', () => {
    const view = journeyOf(gaps, projectId);

    expect(step(view, 'package').state).not.toBe('done');
    expect(step(view, 'package').detail).not.toMatch(/ready|complete/iu);
  });

  it('RF-615 a plan that failed without writing a package still says the plan did not finish', () => {
    const view = journeyOf(
      facts({ plan: planRun({ endState: 'Failed', errorCode: 'RST-1803' }) }),
      projectId,
    );

    expect(step(view, 'package')).toMatchObject({
      state: 'locked',
      detail: 'The plan did not finish',
    });
    expect(step(view, 'package').links).toEqual([]);
  });
});
