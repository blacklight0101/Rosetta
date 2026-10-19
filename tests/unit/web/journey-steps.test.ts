import { describe, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import {
  facts,
  planRun,
  projectId,
  roadSigns,
  source,
  sourceId,
  step,
} from './journey-fixtures.js';

// RF-615, RF-614, DEC-143, RST-1802: the journey from code to package, step by step. Seven steps in
// order; each has a state (done, current, locked with its reason, failed with its code, out of
// date), a cost and a page; exactly one holds the next action. A step whose prerequisites failed is
// locked and is not a link.

const setUp = `/projects/${projectId}/plan-setup?run=${sourceId}`;

describe('journeyOf: the seven steps', () => {
  it('RF-615 shows scan, understand, questions, brief, estimate, plan and package in order', () => {
    const view = journeyOf(roadSigns['estimate'] ?? facts(), projectId);

    expect(view.steps.map((each) => each.title)).toEqual([
      'Scan',
      'Understand',
      'Questions',
      'Brief',
      'Estimate',
      'Plan',
      'Package',
    ]);
  });

  it('RF-615 exactly one step holds the next action, whatever the state of the road', () => {
    const offenders = Object.entries(roadSigns)
      .filter(
        ([, given]) => journeyOf(given, projectId).steps.filter((each) => each.here).length !== 1,
      )
      .map(([name]) => name);

    expect(offenders).toEqual([]);
  });

  it('RF-615 a step that is locked is never a link', () => {
    const offenders = Object.entries(roadSigns).flatMap(([name, given]) =>
      journeyOf(given, projectId)
        .steps.filter((each) => each.state === 'locked' && each.href !== undefined)
        .map((each) => `${name} ${each.key}`),
    );

    expect(offenders).toEqual([]);
  });

  it('RF-615 every step names its cost and the journey adds up the runs', () => {
    const view = journeyOf(roadSigns['written'] ?? facts(), projectId);

    expect(step(view, 'scan').cost).toBe('No model cost');
    expect(step(view, 'understand').cost).toBe('$0.12');
    expect(step(view, 'plan').cost).toBe('$0.31');
    expect(step(view, 'package').cost).toBe('Included in the plan');
    expect(view.totalCostMicros).toBe(430_000);
  });
});

describe('journeyOf: the understand run', () => {
  it('RF-615 with no run yet the scan is the current step and the action starts a run', () => {
    const view = journeyOf(roadSigns['noRun'] ?? facts(), projectId);

    expect(step(view, 'scan')).toMatchObject({ state: 'current', here: true });
    expect(step(view, 'understand')).toMatchObject({ state: 'locked' });
    expect(view.action).toEqual({
      kind: 'link',
      label: 'Start a run',
      href: `/projects/${projectId}/start`,
    });
  });

  it('RF-615 a running understand run is the current step and offers no action', () => {
    const view = journeyOf(roadSigns['running'] ?? facts(), projectId);

    expect(step(view, 'understand')).toMatchObject({
      ...{ state: 'current', here: true, detail: 'Running now', href: `/runs/${sourceId}` },
    });
    expect(step(view, 'questions')).toMatchObject({
      state: 'locked',
      detail: 'Comes after the run finishes',
    });
    expect(view.action).toBeUndefined();
  });

  it('RF-615 a queued understand run says it waits in the queue', () => {
    const view = journeyOf(roadSigns['queued'] ?? facts(), projectId);

    expect(step(view, 'understand')).toMatchObject({ detail: 'Waiting in the queue' });
  });
});

describe('journeyOf: the understand run (2)', () => {
  it('RF-615 a completed run is done and says how many Supported claims it holds', () => {
    const view = journeyOf(roadSigns['estimate'] ?? facts(), projectId);

    expect(step(view, 'understand')).toMatchObject({ state: 'done', detail: '4 Supported claims' });
    expect(step(view, 'scan')).toMatchObject({ state: 'done', detail: 'Code map ready' });
  });

  it('RF-615 one Supported claim is not plural', () => {
    const view = journeyOf(facts({ source: source({ supportedClaims: 1 }) }), projectId);

    expect(step(view, 'understand').detail).toBe('1 Supported claim');
  });

  it('RF-615 the scan step links to the scan run when the project has one', () => {
    const view = journeyOf(facts({ scanRunId: 'scan-1' }), projectId);

    expect(step(view, 'scan').href).toBe('/runs/scan-1');
    expect(step(journeyOf(facts(), projectId), 'scan').href).toBeUndefined();
  });
});

describe('journeyOf: an understand run that stopped', () => {
  it.each([
    ['CapReached', 'RST-1403', 'Stopped at its cap (RST-1403)'],
    ['Failed', 'RST-1203', 'Failed (RST-1203)'],
    ['Interrupted', null, 'Interrupted'],
  ] as const)(
    'RF-615 RF-006 a run that ended %s fails the step and offers Resume',
    (end, code, text) => {
      const view = journeyOf(
        facts({ source: source({ endState: end, errorCode: code, supportedClaims: 0 }) }),
        projectId,
      );

      expect(step(view, 'understand')).toMatchObject({ state: 'failed', detail: text, here: true });
      expect(view.action).toEqual({ kind: 'resume', label: 'Resume', runId: sourceId });
    },
  );

  it('RF-615 RST-1802 the plan steps are locked with the reason and none is a link', () => {
    const view = journeyOf(roadSigns['capped'] ?? facts(), projectId);

    for (const key of ['questions', 'brief', 'estimate', 'plan', 'package'] as const) {
      expect(step(view, key)).toMatchObject({ state: 'locked', href: undefined });
    }
    expect(step(view, 'brief').detail).toBe('Needs a completed run: resume it first');
  });

  it('RF-615 a stopped run never offers the plan, whatever the brief and the plan runs say', () => {
    const view = journeyOf(
      facts({ source: source({ endState: 'Failed' }), plan: planRun(), briefSaved: true }),
      projectId,
    );

    expect(view.action?.kind).toBe('resume');
    expect(step(view, 'plan').state).toBe('locked');
    expect(step(view, 'plan').href).toBeUndefined();
  });
});

describe('journeyOf: a completed run with nothing to plan from', () => {
  it('RST-1802 a run with no Supported claim locks the plan steps and offers a new run', () => {
    const view = journeyOf(roadSigns['noClaims'] ?? facts(), projectId);

    expect(step(view, 'understand')).toMatchObject({
      state: 'done',
      detail: 'No Supported claim to plan from',
    });
    expect(step(view, 'brief')).toMatchObject({
      state: 'locked',
      detail: 'Nothing to plan from (RST-1802)',
    });
    expect(view.action).toEqual({
      kind: 'link',
      label: 'Start a new run',
      href: `/projects/${projectId}/start`,
    });
  });
});

describe('journeyOf: questions, brief and estimate', () => {
  it('RF-615 open questions make the questions step current, before the plan', () => {
    const view = journeyOf(roadSigns['asking'] ?? facts(), projectId);

    expect(step(view, 'questions')).toMatchObject({
      ...{ state: 'current', here: true, detail: '2 open questions', href: `/runs/${sourceId}` },
    });
    expect(step(view, 'brief')).toMatchObject({ state: 'upcoming', here: false });
    expect(view.action).toEqual({
      kind: 'answer',
      label: 'Answer 2 questions',
      href: `/runs/${sourceId}`,
    });
  });

  it('RF-615 one open question is not plural', () => {
    const view = journeyOf(facts({ source: source({ openQuestions: 1 }) }), projectId);

    expect(step(view, 'questions').detail).toBe('1 open question');
  });
});

describe('journeyOf: questions, brief and estimate (2)', () => {
  it('RF-615 with no open question the questions step is done', () => {
    const view = journeyOf(roadSigns['noBrief'] ?? facts(), projectId);

    expect(step(view, 'questions')).toMatchObject({ state: 'done', detail: 'No open questions' });
  });

  it('RF-615 without a brief the brief is current and the estimate and the plan are locked', () => {
    const view = journeyOf(roadSigns['noBrief'] ?? facts(), projectId);

    expect(step(view, 'brief')).toMatchObject({ state: 'current', href: setUp, here: true });
    expect(step(view, 'estimate')).toMatchObject({
      state: 'locked',
      detail: 'Needs the saved brief',
    });
    expect(step(view, 'plan')).toMatchObject({ state: 'locked', detail: 'Needs the saved brief' });
    expect(view.action).toEqual({ kind: 'link', label: 'Set up the plan', href: setUp });
  });

  it('RF-615 with a saved brief the estimate is current and the action reviews it', () => {
    const view = journeyOf(roadSigns['estimate'] ?? facts(), projectId);

    expect(step(view, 'brief')).toMatchObject({ state: 'done', detail: 'Brief saved' });
    expect(step(view, 'estimate')).toMatchObject({ state: 'current', href: setUp, here: true });
    expect(step(view, 'plan')).toMatchObject({
      state: 'upcoming',
      detail: 'Starts when you write the package',
    });
    expect(step(view, 'package')).toMatchObject({ state: 'locked', detail: 'Written by the plan' });
    expect(view.action).toEqual({ kind: 'link', label: 'Review the estimate', href: setUp });
  });
});
