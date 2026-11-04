import { expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { hasRun, headingOf, startsHere } from '../../../web/src/lib/journey/project-heading.js';
import { facts, projectId, roadSigns, source } from './journey-fixtures.js';

// RF-1021, RF-1020, DEC-211 (P8-26): the title of the project page follows the journey: "Start a run"
// before the first run, then the project's name with the current step beside it.

const viewOf = (name: string, extras = {}) =>
  journeyOf(roadSigns[name] ?? facts(), projectId, false, extras);

it('RF-1021 the title is "Start a run" before the first run and while the journey is unread', () => {
  expect(headingOf('OrderDesk', viewOf('noRun'))).toEqual({
    title: 'Start a run',
    status: undefined,
  });
  expect(headingOf('OrderDesk', undefined).title).toBe('Start a run');
});

it('RF-1021 a written package is titled with the project name and "Package ready"', () => {
  const heading = headingOf('OrderDesk', viewOf('written'));

  expect(heading.title).toBe('OrderDesk');
  expect(heading.status?.text).toBe('Package ready');
  expect(heading.status?.tone).toBe('ok');
});

it('RF-1021 open questions are titled "Questions waiting"', () => {
  expect(headingOf('OrderDesk', viewOf('asking')).status?.text).toBe('Questions waiting');
});

it('RF-1021 a package that is out of date or has gaps says so', () => {
  expect(headingOf('OrderDesk', viewOf('stale')).status?.text).toBe('Package out of date');
});

it('RF-1020 RF-1021 a live understand run is titled as running and links to the run', () => {
  const heading = headingOf('OrderDesk', viewOf('running'));

  expect(heading.status?.text).toBe('Understand running');
  expect(heading.status?.href).toBe(`/runs/${source().id}`);
});

it('RF-1020 RF-006 a run the user stopped is a "stopped" step, never failed, and offers Resume', () => {
  const view = viewOf('stoppedByYou');
  const understand = view.steps.find((each) => each.key === 'understand');

  expect(understand).toMatchObject({ state: 'stopped', detail: '', here: true });
  expect(view.action).toMatchObject({ kind: 'resume', runId: source().id });
});

it('RF-1020 a run the user stopped is titled "stopped by you", not failed', () => {
  expect(headingOf('OrderDesk', viewOf('stoppedByYou')).status?.text).toBe(
    'Understand stopped by you',
  );
  expect(headingOf('OrderDesk', viewOf('planStoppedByYou')).status?.text).toBe(
    'Plan stopped by you',
  );
});

it('RF-1020 P8-112 a run at its cap is titled "stopped at its cap" in the warn tone, not failed', () => {
  expect(headingOf('OrderDesk', viewOf('capped')).status).toMatchObject({
    text: 'Understand stopped at its cap',
    tone: 'warn',
  });
  expect(headingOf('OrderDesk', viewOf('planCapped')).status).toMatchObject({
    text: 'Plan stopped at its cap',
    tone: 'warn',
  });
});

it('RF-1020 a running Deepen makes the Questions step and the title link to its run', () => {
  const deepening = facts({
    source: source({ openQuestions: 2, deepening: true }),
    briefSaved: false,
  });
  const view = journeyOf(deepening, projectId, false, { liveRunId: 'deepen-run' });

  const questions = view.steps.find((step) => step.key === 'questions');
  expect(questions?.href).toBe('/runs/deepen-run');
  expect(headingOf('OrderDesk', view).status).toMatchObject({
    text: 'Deepen running',
    href: '/runs/deepen-run',
  });
});

it('RF-1021 a project with a run goes on from the journey; one with nothing to plan from starts again', () => {
  expect(hasRun(viewOf('noRun'))).toBe(false);
  expect(startsHere(viewOf('noRun'))).toBe(true);
  expect(hasRun(viewOf('written'))).toBe(true);
  expect(startsHere(viewOf('written'))).toBe(false);
  expect(startsHere(viewOf('asking'))).toBe(false);
  expect(startsHere(viewOf('noClaims'))).toBe(true);
});

it('RF-241 RF-1021 the strip counts the answered questions and never says none are open while one waits', () => {
  const none = journeyOf(facts({ source: source({ openQuestions: 0 }) }), projectId, false, {
    answered: 1,
  });

  const detail = none.steps.find((step) => step.key === 'questions')?.detail;
  expect(detail).toBe('1 answered question waiting for a re-run');
  expect(detail).not.toContain('No open questions');
});
