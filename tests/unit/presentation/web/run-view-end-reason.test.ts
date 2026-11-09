import { expect, it } from 'vitest';
import { runView } from '../../../../src/presentation/web/run-view.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-1008, P8-111: the API tells why an interrupted run ended, so the page can word it.

it('RF-1008 shows the end reason of a run, and null when it has none', () => {
  const ended = sampleRun({ queueState: 'Ended', endState: 'Interrupted', endReason: 'Restart' });

  expect(runView(ended)).toMatchObject({ endReason: 'Restart' });
  expect(runView(sampleRun())).toMatchObject({ endReason: null });
});
