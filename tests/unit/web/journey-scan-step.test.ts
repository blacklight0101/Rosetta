import { describe, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { facts, projectId, step } from './journey-fixtures.js';

// RF-615, RF-1020, EV-102 (P9-07): the scan step is done once the project has a completed scan,
// before any understand run exists, and the understand step is then the current one.

describe('journeyOf: the scan step once the scan has run', () => {
  it('RF-615 a scanned project with no understand run has the scan done and the understand step current', () => {
    const view = journeyOf(
      facts({ source: null, scanRunId: 'scan-1', briefSaved: false }),
      projectId,
    );

    expect(step(view, 'scan')).toMatchObject({
      state: 'done',
      detail: 'Code map ready',
      href: '/runs/scan-1',
    });
    expect(step(view, 'understand')).toMatchObject({
      state: 'current',
      detail: 'Start a run to understand the code',
      here: true,
    });
    expect(view.action).toEqual({
      kind: 'link',
      label: 'Start a run',
      href: `/projects/${projectId}`,
    });
  });
});
