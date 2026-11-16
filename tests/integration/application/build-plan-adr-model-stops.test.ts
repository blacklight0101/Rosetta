import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { withDecisions } from '../../support/coverage-plan-harness.js';
import type { PlanHarnessOptions } from '../../support/plan-harness.js';
import { plain, seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// P9-18, RF-623, RF-432, RF-1108, ADR-007: the two other ways the check of the data model against
// the decision records stops. An approved amount that refuses the call keeps the package, with a
// check that could not run, and pauses the run for Continue (+N); the owner's Stop during the call
// writes no package and the run ends Interrupted, the check never reading the stop as a refusal.
// The planner is an OpenAI model on the server's key behind the real budget guard.

const temp = useTempRoot('rosetta-adr-model-stops-');

const hilo = {
  title: 'Hi-lo ids generated in the application',
  context: 'The legacy catalog takes its ids from hi-lo sequences.',
  decision: 'Ids are generated in the application from hi-lo sequences.',
  consequences: 'The data model keeps the sequences.',
  sources: ['BR-001'],
};

async function priced(folder: string, extra: PlanHarnessOptions = {}) {
  const answer = join('tests', 'recordings', 'fake', 'planner-adr-model-eshop-ev108.json');
  return seededUxPlan(join(temp.path, folder), {
    recording: await withDecisions([hilo]),
    harness: { cloudPlanner: true, adrModelRecording: await loadRecording(answer), ...extra },
  });
}

/** The approved amount that holds every call of the baseline run but the last one, the check. */
async function lineBeforeLastCall(): Promise<number> {
  const base = await priced('base');
  const run = await base.plan({ cloudConsent: true });
  expect(run.endState).toBe('Completed');
  const { ledger } = base.providers;
  expect(ledger.entries.at(-1)?.agentTaskId).toBe('planner-adr-model');
  const spent = ledger.entries.map((each) => each.costMicros);
  const worst = ledger.reservations.map((each) => each.reservation.worstCase.micros);
  const last = worst.length - 1;
  const before = spent.slice(0, last).reduce((total, each) => total + each, 0n);
  return Number(before + (worst[last] ?? 0n) - 1n);
}

describe('the check of the data model stopped by something other than a cap', () => {
  it('RF-623 RF-432 P9-18 an approved amount that refuses the check keeps the package and pauses the run', async () => {
    const line = await lineBeforeLastCall();
    const h = await priced('approved');

    const run = await h.plan({
      cloudConsent: true,
      approvedAmount: { tokens: 40_000_000, costMicros: line },
    });

    expect(run).toMatchObject({ queueState: 'AwaitingApproval', endState: null });
    expect(h.providers.adrModelRequests()).toHaveLength(0);
    const files = await h.handoffOf(run);
    expect(Object.keys(files)).toContain('tasks.md');
    expect(plain(files['checks.md'])).toContain('could not run: the call failed or was refused');
  });

  it("RF-623 RF-1108 P9-18 the owner's Stop during the check writes no package and the run ends Interrupted", async () => {
    let stops = 0;
    const h = await priced('stopped', {
      beforeAdrModelCall: (harness) => {
        stops += 1;
        return harness.stopRunning();
      },
    });

    const run = await h.plan({ cloudConsent: true });

    expect(stops).toBe(1);
    expect(run.endState).toBe('Interrupted');
    expect(await h.handoffOf(run)).toEqual({});
  });
});
