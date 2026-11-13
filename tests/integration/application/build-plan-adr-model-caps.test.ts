import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { withDecisions } from '../../support/coverage-plan-harness.js';
import { plain, seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// P9-15, RF-623, RF-422, P2-35, P7-26, ADR-007: the check of the data model against the decision
// records is the last planner call and an optional one. When a cap refuses it, the package of the
// plan is still written with a section that says the check could not run and why; the run then
// ends as the cap rules say: a run cap stops the run (`CapReached`), while the planner's role cap
// ends only the step and the run completes, as the summariser's merge and overview do. The planner
// is an OpenAI model on the server's key behind the real budget guard.

const temp = useTempRoot('rosetta-adr-model-caps-');

const hilo = {
  title: 'Hi-lo ids generated in the application',
  context: 'The legacy catalog takes its ids from hi-lo sequences.',
  decision: 'Ids are generated in the application from hi-lo sequences.',
  consequences: 'The data model keeps the sequences.',
  sources: ['BR-001'],
};

type Change = (settings: ProjectSettings) => ProjectSettings;

async function priced(folder: string, change?: Change) {
  const answer = join('tests', 'recordings', 'fake', 'planner-adr-model-eshop-ev108.json');
  const harness = {
    ...{ cloudPlanner: true, adrModelRecording: await loadRecording(answer) },
    ...(change === undefined ? {} : { settings: change }),
  };
  return seededUxPlan(join(temp.path, folder), {
    recording: await withDecisions([hilo]),
    harness,
  });
}

/** The cap that holds every call of the baseline run but the last one, the check of the data model. */
async function capBeforeLastCall(): Promise<bigint> {
  const base = await priced('base');
  const run = await base.plan({ cloudConsent: true });
  expect(run.endState).toBe('Completed');
  const calls = base.providers.ledger.reservations.map((each) => each.reservation);
  expect(base.providers.ledger.entries.at(-1)?.agentTaskId).toBe('planner-adr-model');
  const spent = base.providers.ledger.entries.map((each) => each.costMicros);
  const before = (at: number) => spent.slice(0, at).reduce((total, each) => total + each, 0n);
  const worst = calls.map((each) => each.worstCase.micros);
  const last = worst.length - 1;
  const cap = before(last) + (worst[last] ?? 0n) - 1n;
  worst.slice(0, last).forEach((each, at) => {
    expect(before(at) + each).toBeLessThanOrEqual(cap);
  });
  return cap;
}

const runCap =
  (maxCostMicros: number): Change =>
  (settings) => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxCostMicros } },
  });

const plannerCap =
  (maxCostMicros: number): Change =>
  (settings) => ({
    ...settings,
    budget: { ...settings.budget, roles: { planner: { maxCostMicros } } },
  });

describe('a cap that refuses only the check of the data model', () => {
  it('RF-623 RF-422 P9-15 a run cap keeps the package with the check that could not run, and ends CapReached', async () => {
    const cap = await capBeforeLastCall();

    const h = await priced('run-cap', runCap(Number(cap)));
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('CapReached');
    expect(h.providers.adrModelRequests()).toHaveLength(0);
    const files = await h.handoffOf(run);
    expect(Object.keys(files)).toContain('tasks.md');
    const checks = plain(files['checks.md']);
    expect(checks).toContain('## Data model against the decisions');
    expect(checks).toContain('could not run: the call failed or was refused (RST-1600)');
  });

  it('RF-623 P2-35 P7-26 P9-15 a planner role cap keeps the package and the run completes', async () => {
    const cap = await capBeforeLastCall();

    const h = await priced('role-cap', plannerCap(Number(cap)));
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('Completed');
    expect(h.providers.adrModelRequests()).toHaveLength(0);
    const checks = plain((await h.handoffOf(run))['checks.md']);
    expect(checks).toContain('could not run: the call failed or was refused (RST-1600)');
  });
});
