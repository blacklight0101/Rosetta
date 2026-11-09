import { describe, expect, it } from 'vitest';
import { RUN_END_STATES, RUN_QUEUE_STATES } from '../../../src/domain/runs/run-states.js';
import type { JourneyFacts } from '../../../web/src/api/journey-schemas.js';
import { projectOverviewSchema } from '../../../web/src/api/overview-schemas.js';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { headingOf } from '../../../web/src/lib/journey/project-heading.js';
import { positionOf } from '../../../web/src/lib/journey/project-position.js';
import { facts, projectId, roadSigns, source, step } from './journey-fixtures.js';
import { lastRunOf, overviewRow, projectOf } from './project-fixtures.js';

// RF-010, RF-615, RF-1021, P8-137, DEC-226: "Where it is" of the projects list says what the project
// page says beside its title, made by the same code from the journey facts the overview carries, so a
// row and the strip of its project cannot drift; the overview's parse takes every state the server
// can send, so that one run never takes the whole list down.

function parsed(over: Record<string, unknown>) {
  const rows = [overviewRow(projectOf(projectId, 'octo/demo'), over)];
  const { projects } = projectOverviewSchema.parse({ projects: rows, truncated: false });
  const row = projects[0];
  if (row === undefined) throw new Error('No row was parsed.');
  return row;
}

const lastRun = (over: Record<string, unknown>) =>
  parsed({ runs: 1, lastRun: lastRunOf(over) }).lastRun;

/** The position of a row whose project has these journey facts. */
const rowPosition = (journey: JourneyFacts, skippedDeepen = false) =>
  positionOf({ projectId, lastRun: null, journey: parsed({ journey }).journey, skippedDeepen });

const pageStatus = (journey: JourneyFacts, skipped = false) =>
  headingOf('octo/demo', journeyOf(journey, projectId, skipped, {})).status;

const live = { endState: null, endedAt: null };
const withRun = Object.entries(roadSigns).filter(([, journey]) => journey.source !== null);

describe('RF-010 where it is says what the project page says', () => {
  it.each(withRun)(
    'RF-010 the journey state %s reads as the title of its project page',
    (_, journey) => {
      expect(rowPosition(journey).text).toBe(pageStatus(journey)?.text);
    },
  );

  it.each([
    ['asking', 'Questions waiting'],
    ['noBrief', 'Plan setup waiting'],
    ['estimate', 'Estimate waiting'],
    ['stale', 'Package out of date'],
    ['written', 'Package ready'],
    ['planning', 'Plan running'],
    ['stoppedByYou', 'Understand stopped by you'],
  ])('RF-615 the journey state %s reads %s, which the last run cannot tell', (name, text) => {
    expect(rowPosition(roadSigns[name] ?? facts()).text).toBe(text);
  });

  it('RF-646 a Deepen waiting and a Deepen running read as on the project page', () => {
    const first = facts({ source: source({ openQuestions: 2, deepens: 0 }), briefSaved: false });
    const deepening = facts({
      source: source({ openQuestions: 2, deepens: 0, deepening: true }),
      briefSaved: false,
    });

    expect(rowPosition(first).text).toBe('Deepen waiting');
    expect(rowPosition(deepening).text).toBe('Deepen running');
    expect(rowPosition(first, true).text).toBe(pageStatus(first, true)?.text);
    expect(rowPosition(first, true).text).toBe('Questions waiting');
  });

  it.each([
    ['Questions waiting', 'asking', 'attention'],
    ['Package ready', 'written', 'done'],
    ['Understand running', 'running', 'working'],
    ['Plan failed', 'failed', 'failed'],
  ])('RF-010 %s keeps a glyph of its tone, never colour alone', (_, name, tone) => {
    expect(rowPosition(roadSigns[name] ?? facts()).tone).toBe(tone);
  });
});

describe('RF-010 where it is before the first understand run', () => {
  it('RF-010 a project with only a scan reads what its page and its strip read', () => {
    const journey = facts({ source: null, scanRunId: 'scan-1', briefSaved: false });
    const view = journeyOf(journey, projectId, false, {});

    const { text } = positionOf({
      ...{ projectId, lastRun: lastRun({ stage: 'scan' }), journey, skippedDeepen: false },
    });

    expect(headingOf('octo/demo', view).title).toBe(text);
    expect(step(view, 'scan').detail).toContain(text);
  });

  it('RF-010 a project with no run reads the first step of the journey', () => {
    expect(positionOf({ projectId, lastRun: null, journey: null, skippedDeepen: false })).toEqual({
      text: 'Scan not started',
      tone: 'idle',
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
