import { describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { join } from 'node:path';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-627, RF-604: a coverage answer cut off at the output limit is continued twice and then used as
// far as it goes; like a cut-off document it does not fail the call. Its links that are lost leave
// items without a card, so the package is written and the run ends RST-1806, not RST-1805.

const temp = useTempRoot('rosetta-coverage-cut-');

describe('BuildPlan: a coverage answer that stays cut off', () => {
  it('RF-627 is logged as a warning, the package is written and the run ends RST-1806', async () => {
    const whole = await loadRecording(join('tests', 'recordings', 'fake', 'planner-coverage.json'));
    const attempt = whole.calls[0]?.attempts[0];
    if (attempt === undefined || !('response' in attempt)) throw new Error('A recorded answer');
    const cut = {
      attempts: [
        {
          response: {
            ...attempt.response,
            text: '{"links": [{"task": 1, "bui',
            finishReason: 'length' as const,
          },
        },
      ],
    };
    const coverageRecording = { ...whole, calls: [cut, cut, cut] };
    const h = await seededUxPlan(temp.path, { harness: { coverageRecording } });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const entries = h.s.logger.entries;
    expect(entries).toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    expect(entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1805' }));
    expect(
      entries.some((entry) => entry.level === 'warn' && entry.message.includes('cut off')),
    ).toBe(true);
    expect(Object.keys(await h.handoffOf(run))).toContain('checks.md');
    expect(h.providers.coverageRequests()).toHaveLength(3);
  });
});
