import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../src/application/runs/run-scope.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-1015, RF-1002 (P7-25): every planner provider call of a plan run is announced by a
// `plan.call.started` event under the agent task of the document, so the page can show which call
// is working and for how long.

const temp = useTempRoot('rosetta-plan-call-events-');

describe('BuildPlan: the planner call events', () => {
  it('RF-1015 announces each planner call before its usage is recorded', async () => {
    const h = await seededUxPlan(temp.path);

    const run = await h.plan();

    const events = await h.s.log.read(scopeOf(run), 0);
    const started = events.filter((event) => event.type === 'plan.call.started');
    const tasks = started.map((event) => event.agentTaskId);
    expect(tasks).toEqual(expect.arrayContaining(['planner-package', 'planner-prd', 'planner-ux']));
    const usage = events.filter((event) => event.type === 'usage.recorded');
    expect(started.length).toBe(usage.length);
    const first = events.findIndex((event) => event.type === 'plan.call.started');
    expect(first).toBeLessThan(events.findIndex((event) => event.type === 'usage.recorded'));
  });
});
