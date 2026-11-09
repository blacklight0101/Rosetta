import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../src/application/runs/run-scope.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { withCoverageAnswer } from '../../support/coverage-plan-harness.js';
import { closingGapRecording, gapRecordingOfAll } from '../../support/gap-plan-harness.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// P8-96, RF-627, RF-604, RF-007, ADR-007, ADR-008: items still built by no card after a first gap
// round whose answers could all be read get one second gap round, the same gap call for only the
// items still open, through the same guards as every planner call. RST-1806 ends the run only
// after it. The coverage call links only the first feature, so eight items are left; the gap
// answers are replayed from tests/support/gap-plan-harness.ts and
// tests/recordings/fake/planner-gap.json (the answer whose cards build the eight).

const temp = useTempRoot('rosetta-gap-second-');

const linksOne = JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] });
const nothing = '{"tasks": []}';
const eightGaps = [
  'operation:getOrder',
  'operation:listCustomers',
  'operation:listOrders',
  'operation:placeOrder',
  'operation:signIn',
  'flow:FLOW-001',
  'screen:SCRN-001',
  'screen:SCRN-003',
];
/** P8-95 follow-up: a link to a card the plan does not have is dropped, and its items stay open. */
const droppedLink = JSON.stringify({ tasks: [], links: [{ task: 'T-900', builds: eightGaps }] });

type Harness = Awaited<ReturnType<typeof seededUxPlan>>;

async function planWith(
  answers: readonly string[],
  beforeGapCall?: (harness: Harness) => Promise<void>,
) {
  return seededUxPlan(temp.path, {
    harness: {
      coverageRecording: await withCoverageAnswer(linksOne),
      gapRecording: gapRecordingOfAll(...answers),
      ...(beforeGapCall === undefined ? {} : { beforeGapCall }),
    },
  });
}

async function closingText(): Promise<string> {
  const recording = await closingGapRecording();
  const [call] = recording.calls;
  const [attempt] = call?.attempts ?? [];
  return attempt !== undefined && 'response' in attempt ? attempt.response.text : '';
}

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

async function eventsOf(h: Harness, run: Run) {
  return h.s.log.read(scopeOf(run), 0);
}

async function roundsOf(h: Harness, run: Run): Promise<unknown[]> {
  const events = await eventsOf(h, run);
  return events.filter((each) => each.type === 'plan.gap.rounds').map((each) => each.data);
}

const block = (h: Harness, at: number): string =>
  (
    h.providers
      .gapRequests()
      [at]?.messages.map((each) => each.content)
      .join('\n') ?? ''
  ).split('<<<END')[0] ?? '';

describe('BuildPlan: the second gap round', () => {
  it('RF-627 P8-96 a link of the first round dropped while it named open items is asked for again, and the second round completes the plan', async () => {
    const h = await planWith([droppedLink, await closingText()]);

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(2);
    for (const id of eightGaps) expect(block(h, 1)).toContain(`"id": "${id}"`);
    expect(block(h, 1)).not.toContain('"id": "feature:F-001"');
    const warned = h.s.logger.entries.map((entry) => entry.message);
    expect(warned).toContain(
      'Link at position 1 of the gap answer was dropped: the field "task" names no task card of the plan.',
    );
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    expect(await roundsOf(h, run)).toEqual([{ rounds: 2 }]);
  });

  it('RF-627 P8-96 RST-1806 items still open after the second round end the run as today', async () => {
    const h = await planWith([nothing, nothing]);

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.gapRequests()).toHaveLength(2);
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    const checks = plain((await h.handoffOf(run))['checks.md']);
    expect(checks).toContain('placeOrder');
    expect(await roundsOf(h, run)).toEqual([{ rounds: 2 }]);
  });
});

describe('BuildPlan: no second gap round', () => {
  it('RF-627 P8-96 a first answer that could not be read asks for no second round', async () => {
    const h = await planWith(['The cards are below.', nothing]);

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.gapRequests()).toHaveLength(1);
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    expect(await roundsOf(h, run)).toEqual([{ rounds: 1 }]);
  });

  it('RF-627 P8-96 a first round that builds every item asks for no second round', async () => {
    const h = await planWith([await closingText()]);

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(1);
    expect(await roundsOf(h, run)).toEqual([{ rounds: 1 }]);
  });
});

describe('BuildPlan: what the second gap round leaves on record', () => {
  it('RF-627 P8-96 RF-421 each gap round is metered and counted like any planner call', async () => {
    const h = await planWith([nothing, nothing]);

    const run = await h.plan();

    const events = await eventsOf(h, run);
    const metered = events.filter(
      (each) => each.type === 'usage.recorded' && each.agentTaskId === 'planner-gap',
    );
    expect(metered).toHaveLength(2);
    const manifest = await h.manifestOf(run);
    const all = events.filter((each) => each.type === 'usage.recorded');
    expect(manifest.totals.calls).toBe(all.length);
  });

  it('RF-627 P8-96 checks.md lists the cards the second answer left out under its own area', async () => {
    const unreadable = {
      ...{ title: 'The journey', phase: 1, requirements: { id: 1 } },
      acceptanceCriteria: ['Given a basket of 60, when it is posted, then the order is stored.'],
      ...{ invariant: 'An order posted is an order stored.', riskClass: 'none' },
      builds: ['flow:FLOW-001'],
    };
    const h = await planWith([nothing, JSON.stringify({ tasks: [unreadable] })]);

    const run = await h.plan();

    const checks = plain((await h.handoffOf(run))['checks.md']);
    expect(checks).toContain('### Second gap answer');
    expect(checks).toMatch(/^- `1`: the field "requirements"\. .*card was left out\./mu);
    const warned = h.s.logger.entries.map((entry) => entry.message);
    expect(warned).toContain(
      'Task card at position 1 of the second gap answer was left out: the field "requirements" has the wrong type or shape.',
    );
    expect(h.providers.gapRequests()).toHaveLength(2);
  });
});

/** The second gap call is refused by the guard; the first goes through. */
const refusingSecond =
  (error: Error) =>
  (harness: Harness): Promise<void> =>
    harness.providers.gapRequests().length === 0 ? Promise.resolve() : Promise.reject(error);

describe('BuildPlan: the second gap round refused by a guard', () => {
  it('RF-627 P8-96 RF-422 a cap that refuses the second round ends the run CapReached and keeps the first package', async () => {
    const cap = new RosettaError(ERROR_CODES.budgetCapReached, 'The call would pass the cap.');
    const h = await planWith([nothing, nothing], refusingSecond(cap));

    const run = await h.plan();

    expect(run.endState).toBe('CapReached');
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1600' }));
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    const checks = plain((await h.handoffOf(run))['checks.md']);
    expect(checks).toContain('placeOrder');
    expect(await roundsOf(h, run)).toEqual([{ rounds: 1 }]);
  });

  it('RF-627 P8-96 RST-1522 the Ollama context guard refusing the second round ends the run with its code', async () => {
    const specific = 'The planner prompt is about 31361 tokens but the context is 32768.';
    const guard = new RosettaError(ERROR_CODES.ollamaPromptTooLarge, specific);
    const h = await planWith([nothing, nothing], refusingSecond(guard));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.s.logger.entries).toContainEqual(
      expect.objectContaining({ code: 'RST-1522', message: specific }),
    );
  });
});
