import { describe, expect, it } from 'vitest';
import { buildReplay } from '../../../../src/application/report/replay-timeline.js';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';
import { replayDemoEvents, replayDemoRunKey } from '../../../support/replay-fixture.js';

// RF-506: the timeline of agents, turns, tool calls, cards, verdicts and cost of a recorded run.

const events = await replayDemoEvents();
const replay = buildReplay(replayDemoRunKey, events);

function event(seq: number, type: string, data: Record<string, unknown>, agent?: string): RunEvent {
  return {
    schemaVersion: 1,
    seq,
    at: `2026-10-12T10:00:${String(seq).padStart(2, '0')}.000Z`,
    runId: replayDemoRunKey,
    type,
    ...(agent === undefined ? {} : { agentTaskId: agent }),
    data,
  };
}

const labels = [
  'Run started',
  'Source resolved',
  'Source downloaded',
  'Scan completed',
  'Agent planned',
  'Agent planned',
  'Agent started',
  'Turn',
  'Tool call',
  'Tool result',
  'Usage',
  'Turn',
  'Tool call',
  'Tool result',
  'Card proposed',
  'Citation check',
  'Verdict',
  'Usage',
  'Agent ended',
  'Agent started',
  'Turn',
  'Agent ended',
  'Budget warning',
  'Run ended',
];

const textOf = (seq: number): string | undefined =>
  replay.steps.find((step) => step.seq === seq)?.text;

describe('buildReplay steps', () => {
  it('RF-506 has one step per known event, in the order of the log', () => {
    expect(replay.steps.map((step) => step.seq)).toEqual(events.map((each) => each.seq));
    expect(replay.steps.map((step) => step.label)).toEqual(labels);
  });

  it('RF-506 names the kind of each step so the page can style it', () => {
    const kinds = new Set(replay.steps.map((step) => step.kind));

    expect([...kinds].sort()).toEqual(
      [
        'agent',
        'budget',
        'card',
        'cost',
        'run',
        'scan',
        'source',
        'tool',
        'turn',
        'verdict',
      ].sort(),
    );
  });
});

describe('buildReplay step text', () => {
  it('RF-506 says what each step is about in text', () => {
    expect(textOf(1)).toBe('Stage understand');
    expect(textOf(2)).toBe('https://github.com/octo/demo @ main, commit 3f786850e387');
    expect(textOf(3)).toBe('12 files, 48213 bytes, cached');
    expect(textOf(4)).toBe('12 files in 2 areas');
    expect(textOf(7)).toBe('orders: reader (model-a)');
    expect(textOf(8)).toBe('Turn 1: 1200 tokens in, 80 out');
    expect(textOf(10)).toBe('read_file: ok, 15 lines');
    expect(textOf(14)).toBe('grep: refused (RST-1100)');
    expect(textOf(16)).toBe('BR-001.c1: citation ok');
    expect(textOf(19)).toBe('Done, 2 turns, 1 card');
    expect(textOf(23)).toBe('run at 50 percent of its cap');
    expect(textOf(24)).toBe('Completed');
  });

  it('RF-506 shows tool arguments as sorted key=value pairs, text and numbers only', () => {
    expect(textOf(9)).toBe(
      'read_file endLine=24 path=src/<img src=x onerror="window.__pwned=\'onerror\'">.cs startLine=10',
    );
  });

  it('RF-506 keeps the card title and the verdict reason as they are, for the page to render as text', () => {
    expect(textOf(15)).toBe(
      "BR-001 <script>window.__pwned = 'script'</script> Order <b>checkout</b> (1 claim)",
    );
    expect(textOf(17)).toContain("[details](javascript:window.__pwned='link')");
  });

  it('RF-506 counts the time since the first event', () => {
    expect(replay.steps.map((step) => step.offsetMs).slice(0, 3)).toEqual([0, 2000, 4000]);
    expect(replay.durationMs).toBe(46_000);
  });
});

describe('buildReplay agents and cost', () => {
  it('RF-506 lists the agents in the order they were planned, with how they ended', () => {
    expect(replay.agents).toEqual([
      {
        agentTaskId: 'task-orders',
        area: 'orders',
        role: 'reader',
        model: 'model-a',
        state: 'Done',
        turns: 2,
        cards: 1,
      },
      {
        agentTaskId: 'task-catalog',
        area: 'catalog',
        role: 'reader',
        model: 'model-a',
        state: 'Done',
        turns: 1,
        cards: 0,
      },
    ]);
  });
});

describe('buildReplay cost and odd input', () => {
  it('RF-506 follows the cost and the tokens over time', () => {
    const costs = replay.steps.map((step) => step.costMicros);
    const at = (seq: number) => replay.steps.find((step) => step.seq === seq);

    expect(costs).toEqual([...costs].sort((left, right) => left - right));
    expect(at(10)?.costMicros).toBe(0);
    expect(at(11)?.costMicros).toBe(1500);
    expect(at(18)?.costMicros).toBe(4000);
    expect(at(8)?.tokens).toBe(1280);
    expect(at(24)?.tokens).toBe(3930);
    expect(replay.totalCostMicros).toBe(4000);
    expect(replay.totalTokens).toBe(3930);
  });

  it('RF-506 leaves out a type it does not know and an event whose data does not fit', () => {
    const odd = buildReplay(replayDemoRunKey, [
      event(1, 'run.started', { stage: 'scan' }),
      event(2, 'something.new', { anything: true }),
      event(3, 'agent.turn', { turn: 'one' }, 'task-a'),
      event(4, 'run.ended', { endState: 'Completed', totals: { costMicros: 7 } }),
    ]);

    expect(odd.steps.map((step) => step.seq)).toEqual([1, 4]);
    expect(odd.totalCostMicros).toBe(7);
  });

  it('RF-506 gives a run without events an empty replay', () => {
    expect(buildReplay(replayDemoRunKey, [])).toEqual({
      runKey: replayDemoRunKey,
      steps: [],
      agents: [],
      durationMs: 0,
      totalTokens: 0,
      totalCostMicros: 0,
    });
  });
});

describe('buildReplay judgement step', () => {
  it('RF-506 RF-301 shows where the judgement step started and ended, with its counts', () => {
    const judged = buildReplay(replayDemoRunKey, [
      event(1, 'run.started', { stage: 'understand' }),
      event(2, 'verify.judgement.started', { claims: 2 }),
      event(3, 'verify.claim.judged', { claimId: 'BR-001.c1', status: 'Supported', reason: 'Ok.' }),
      event(4, 'verify.judgement.ended', {
        supported: 1,
        rejected: 0,
        unverified: 0,
        notJudged: 1,
      }),
    ]);

    const steps = judged.steps.filter((step) => step.seq !== 1 && step.seq !== 3);
    expect(steps.map(({ kind, label, text }) => ({ kind, label, text }))).toEqual([
      { kind: 'verdict', label: 'Judgement started', text: '2 claims to judge' },
      {
        kind: 'verdict',
        label: 'Judgement ended',
        text: '1 supported, 0 rejected, 0 unverified, 1 not judged',
      },
    ]);
  });

  it('P3-122 says how many claims were judged without a model call when the event counts them', () => {
    const judged = buildReplay(replayDemoRunKey, [
      event(1, 'verify.judgement.ended', {
        supported: 4,
        rejected: 2,
        unverified: 0,
        notJudged: 0,
        withoutModel: 3,
      }),
    ]);

    expect(judged.steps.map((step) => step.text)).toEqual([
      '4 supported, 2 rejected, 0 unverified, 0 not judged, 3 judged without a model call',
    ]);
  });
});
