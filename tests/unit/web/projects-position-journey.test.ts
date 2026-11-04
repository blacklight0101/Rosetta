import { describe, expect, it } from 'vitest';
import { RUN_END_STATES, RUN_QUEUE_STATES } from '../../../src/domain/runs/run-states.js';
import { projectOverviewSchema } from '../../../web/src/api/overview-schemas.js';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { headingOf } from '../../../web/src/lib/journey/project-heading.js';
import { positionOf } from '../../../web/src/lib/journey/project-position.js';
import { facts, planRun, projectId, roadSigns, source, step } from './journey-fixtures.js';
import { lastRunOf, overviewRow, projectOf } from './project-fixtures.js';

// RF-010, RF-615, RF-432, DEC-222: "Where it is" of the projects list agrees with the project page for
// the same run, as far as the last run can tell, and the overview's parse takes every state the server
// can send, so that one run never takes the whole list down.

function lastRun(over: Record<string, unknown>) {
  const rows = [overviewRow(projectOf('p-1', 'octo/demo'), { runs: 1, lastRun: lastRunOf(over) })];
  const { projects } = projectOverviewSchema.parse({ projects: rows, truncated: false });
  return projects[0]?.lastRun ?? null;
}

const viewOf = (name: string) => journeyOf(roadSigns[name] ?? facts(), projectId, false, {});

const live = { endState: null, endedAt: null };

describe('RF-010 where it is agrees with the project page', () => {
  it('RF-010 a project with only a scan reads what its page and its strip read', () => {
    const view = journeyOf(
      facts({ source: null, scanRunId: 'scan-1', briefSaved: false }),
      projectId,
      false,
      {},
    );

    const { text } = positionOf(lastRun({ stage: 'scan' }));

    expect(headingOf('octo/demo', view).title).toBe(text);
    expect(step(view, 'scan').detail).toContain(text);
    expect(step(view, 'scan').state).toBe('upcoming');
  });

  it.each([
    ['running', { stage: 'understand', queueState: 'Running', ...live }],
    ['capped', { stage: 'understand', endState: 'CapReached' }],
    ['planCapped', { stage: 'plan', endState: 'CapReached' }],
    ['planning', { stage: 'plan', queueState: 'Running', ...live }],
    ['failed', { stage: 'plan', endState: 'Failed' }],
    ['written', { stage: 'plan' }],
  ])('RF-010 the state %s reads as the page title of its project', (name, over) => {
    expect(positionOf(lastRun(over)).text).toBe(headingOf('octo/demo', viewOf(name)).status?.text);
  });

  it('RF-010 a run stopped by the user reads the word of its step in the strip', () => {
    const { text } = positionOf(lastRun({ stage: 'understand', endState: 'Interrupted' }));

    expect(headingOf('octo/demo', viewOf('stoppedByYou')).status?.text).toBe(
      `Understand ${text.toLowerCase()}`,
    );
    expect(step(viewOf('stoppedByYou'), 'understand').state).toBe('stopped');
  });

  it.each([
    ['understand', facts({ source: source({ queueState: 'AwaitingApproval', ...live }) })],
    ['plan', facts({ plan: planRun({ queueState: 'AwaitingApproval', ...live }) })],
  ])('RF-432 a paused %s run reads the title its page has', (stage, journey) => {
    const paused = lastRun({ stage, queueState: 'AwaitingApproval', ...live });

    expect(positionOf(paused)).toEqual({
      text: headingOf('octo/demo', journeyOf(journey, projectId, false, {})).status?.text,
      tone: 'attention',
    });
  });
});

describe('RF-432 the overview takes every state of the server', () => {
  it.each(RUN_QUEUE_STATES)(
    'RF-432 the parse of the overview takes the queue state %s',
    (queueState) => {
      expect(lastRun({ queueState, ...live })?.queueState).toBe(queueState);
    },
  );

  it.each(RUN_END_STATES)('RF-432 the parse of the overview takes the end state %s', (endState) => {
    expect(lastRun({ endState })?.endState).toBe(endState);
  });
});
