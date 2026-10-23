import { describe, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { facts, projectId, roadSigns, source, sourceId, step } from './journey-fixtures.js';

// RF-615, RF-614, RST-1802, P3-121: an understand run that stopped at a cap with Supported claims can
// be planned from; Resume stays the action and the plan is offered beside it.

describe('journeyOf: an understand run that stopped at a cap with Supported claims', () => {
  it('RF-615 RF-614 P3-121 the brief, estimate and plan steps are open, and the understand step says it stopped', () => {
    const view = journeyOf(roadSigns['cappedWithClaims'] ?? facts(), projectId);

    expect(step(view, 'understand')).toMatchObject({
      state: 'failed',
      detail: 'Stopped at its cap (RST-1403)',
    });
    expect(step(view, 'brief')).toMatchObject({ state: 'upcoming', detail: 'Not saved yet' });
    expect(step(view, 'brief').href).toContain('/plan-setup');
    expect(step(view, 'package').state).toBe('locked');
  });

  it('RF-615 RF-006 P3-121 Resume stays the action and planning from the judged claims is offered beside it', () => {
    const view = journeyOf(roadSigns['cappedWithClaims'] ?? facts(), projectId);

    expect(view.action).toEqual({ kind: 'resume', label: 'Resume this run', runId: sourceId });
    expect(view.secondary).toMatchObject({ label: 'Plan from what was judged' });
    expect(view.secondary?.href).toContain('/plan-setup');
  });

  it('RF-615 P3-121 with the brief saved the journey goes on to the estimate', () => {
    const view = journeyOf(
      facts({
        source: source({ endState: 'CapReached', errorCode: 'RST-1403', supportedClaims: 3 }),
      }),
      projectId,
    );

    expect(view.action).toMatchObject({ kind: 'link', label: 'Review the estimate' });
  });

  it('RST-1802 a run that stopped at a cap with no Supported claim keeps the plan steps locked', () => {
    const view = journeyOf(roadSigns['capped'] ?? facts(), projectId);

    expect(step(view, 'brief').state).toBe('locked');
  });
});
