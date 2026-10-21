import { describe, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import {
  facts,
  planId,
  planRun,
  projectId,
  roadSigns,
  sourceId,
  step,
} from './journey-fixtures.js';

// RF-615, RF-614, DEC-143: the plan run and the package of the journey: a plan that runs, one that
// failed (with its code, its cost and Try the plan again), a written package, and one that is out
// of date because the brief or the source run changed.

const setUp = `/projects/${projectId}/plan-setup?run=${sourceId}`;

describe('journeyOf: the plan run', () => {
  it('RF-615 a running plan run is the current step and offers no action', () => {
    const view = journeyOf(roadSigns['planning'] ?? facts(), projectId);

    expect(step(view, 'plan')).toMatchObject({
      ...{ state: 'current', here: true, detail: 'Running now', href: `/runs/${planId}` },
    });
    expect(step(view, 'package')).toMatchObject({
      state: 'locked',
      detail: 'Written when the plan finishes',
    });
    expect(view.action).toBeUndefined();
  });

  it('RF-615 a failed plan run shows its code and cost and offers Try the plan again', () => {
    const view = journeyOf(roadSigns['failed'] ?? facts(), projectId);

    expect(step(view, 'plan')).toMatchObject({
      ...{ state: 'failed', detail: 'Failed (RST-1803)', cost: '$0.031', here: true },
    });
    expect(step(view, 'package')).toMatchObject({
      state: 'locked',
      detail: 'The plan did not finish',
    });
    expect(view.action).toEqual({ kind: 'link', label: 'Try the plan again', href: setUp });
  });

  it('RF-615 a failed plan run leaves the understand run, the questions and the brief as they were', () => {
    const failed = journeyOf(roadSigns['failed'] ?? facts(), projectId);
    const before = journeyOf(roadSigns['estimate'] ?? facts(), projectId);

    for (const key of ['scan', 'understand', 'questions', 'brief'] as const) {
      expect(step(failed, key)).toEqual(step(before, key));
    }
  });

  it('RF-615 a plan run that ended CapReached is a failed step with its code and is tried again', () => {
    const view = journeyOf(
      facts({ plan: planRun({ endState: 'CapReached', errorCode: 'RST-1403' }) }),
      projectId,
    );

    expect(step(view, 'plan')).toMatchObject({
      state: 'failed',
      detail: 'Stopped at its cap (RST-1403)',
    });
    expect(view.action).toMatchObject({ label: 'Try the plan again' });
  });
});

describe('journeyOf: the package', () => {
  it('RF-615 a written package is done, opens its run and is the next action', () => {
    const view = journeyOf(roadSigns['written'] ?? facts(), projectId);

    expect(step(view, 'plan')).toMatchObject({ state: 'done', detail: 'Completed' });
    expect(step(view, 'package')).toMatchObject({
      ...{ state: 'done', detail: 'Ready to open', here: true, href: `/runs/${planId}` },
    });
    expect(view.action).toEqual({
      kind: 'link',
      label: 'Open the package',
      href: `/runs/${planId}`,
    });
  });

  it('RF-615 DEC-143 a package whose brief or source changed is out of date and wants a new estimate', () => {
    const view = journeyOf(roadSigns['stale'] ?? facts(), projectId);

    expect(step(view, 'package')).toMatchObject({
      ...{ state: 'out-of-date', href: `/runs/${planId}`, here: false },
      detail: 'Out of date: the brief or the source run changed',
    });
    expect(step(view, 'estimate')).toMatchObject({
      ...{ state: 'current', detail: 'A new estimate is needed', here: true },
    });
    expect(view.action).toEqual({ kind: 'link', label: 'Review the new estimate', href: setUp });
  });

  it('RF-615 an earlier package is kept while a later plan run failed', () => {
    const view = journeyOf(
      facts({
        plan: planRun({ endState: 'Failed', errorCode: 'RST-1803' }),
        handoff: {
          runId: 'earlier',
          runKey: '20261011-100000-plan',
          outOfDate: false,
          gaps: false,
        },
      }),
      projectId,
    );

    expect(step(view, 'package')).toMatchObject({
      state: 'done',
      detail: 'An earlier package is kept',
      href: '/runs/earlier',
    });
    expect(view.action).toMatchObject({ label: 'Try the plan again' });
  });
});
