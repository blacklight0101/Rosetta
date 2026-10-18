import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import type { Recording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-604, RF-602, RF-007: a planner answer cut off at the output limit is continued, and one that
// stays cut off ends the run with its own code instead of RST-1803. The planner replays
// tests/recordings/fake/planner-package.json with one of its answers cut in pieces.

const temp = useTempRoot('rosetta-plan-cut-off-');

const noSupport =
  '{"requirements": [{"title": "Export", "statement": "Export.", "sources": ["FEAT-002"]}]}';

function base(): Promise<Recording> {
  return loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json'));
}

function textOf(recording: Recording, call: number): string {
  const attempt = recording.calls[call]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) throw new Error('No answer recorded');
  return attempt.response.text;
}

/** The answer of call `at` as these pieces: each but the last stopped by the output limit. */
function cutAt(
  recording: Recording,
  at: number,
  pieces: readonly string[],
  lastCut = false,
): Recording {
  const attempt = recording.calls[at]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) throw new Error('No answer recorded');
  const calls = pieces.map((text, index) => {
    const last = index === pieces.length - 1 && !lastCut;
    const usage = { ...attempt.response.usage, outputTokens: last ? 300 : 4096 };
    const finishReason = last ? ('stop' as const) : ('length' as const);
    return { attempts: [{ response: { ...attempt.response, text, usage, finishReason } }] };
  });
  return {
    ...recording,
    calls: [...recording.calls.slice(0, at), ...calls, ...recording.calls.slice(at + 1)],
  };
}

function split(text: string, parts: number): string[] {
  const size = Math.ceil(text.length / parts);
  return Array.from({ length: parts }, (_, index) => text.slice(index * size, (index + 1) * size));
}

async function planned(recording: Recording, cloud = false): Promise<PlanHarness> {
  const h = await createPlanHarness(join(temp.path, cloud ? 'cloud' : 'local'), recording, {
    cloudPlanner: cloud,
  });
  const run = await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.answer(run, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel a paid order.' }]);
  await h.saveBrief({ migration: 'parallel-change' });
  return h;
}

describe('BuildPlan: a planner answer cut off at the output limit', () => {
  it('RF-604 a cut-off first answer is continued and the run completes', async () => {
    const recording = await base();
    const [head = '', tail = ''] = split(textOf(recording, 0), 2);
    const h = await planned(cutAt(recording, 0, [head, tail]));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const requests = h.providers.requests();
    expect(requests.map((each) => each.context.agentTaskId).slice(0, 3)).toEqual([
      'planner-package',
      'planner-package',
      'planner-prd',
    ]);
    const second = requests[1]?.messages ?? [];
    expect(second).toHaveLength(3);
    expect(second[1]).toEqual({ role: 'assistant', content: head });
    expect(second[2]?.content).toContain('Continue exactly where it stopped');
    expect(Object.keys(await h.handoffOf(run))).toContain('prd.md');
    const manifest = await h.manifestOf(run);
    expect(Object.keys(manifest.promptVersions)).toContain('planner/continue.v1.md');
  });

  it('RF-604 a first answer that stays cut off ends Failed with RST-1805 and never RST-1803', async () => {
    const recording = await base();
    const text = textOf(recording, 0);
    const h = await planned(cutAt(recording, 0, split(text, 4)));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.requests()).toHaveLength(3);
    const entries = h.s.logger.entries;
    expect(entries).toContainEqual(expect.objectContaining({ code: 'RST-1805' }));
    expect(entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1803' }));
    const logged = entries.find((entry) => entry.code === 'RST-1805');
    const limit = String(h.providers.requests()[0]?.maxOutputTokens);
    expect(logged?.message).toContain(`${limit} output tokens`);
    expect(logged?.message).toContain('Planner max output tokens');
    expect(logged?.message).not.toContain(text.slice(0, 40));
    expect(await h.handoffOf(run)).toEqual({});
  });
});

describe('BuildPlan: what a cut-off answer is not', () => {
  it('RF-602 a continued answer that names no supported requirement is RST-1803', async () => {
    const recording = await base();
    const h = await planned(cutAt(recording, 0, [noSupport.slice(0, 60), noSupport.slice(60)]));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.requests()).toHaveLength(2);
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1803' }));
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1805' }));
  });

  it('RF-602 a complete answer reported as length with no supported requirement is RST-1803', async () => {
    const recording = await base();
    const h = await planned(cutAt(recording, 0, [noSupport, '']));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.requests()).toHaveLength(1);
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1803' }));
  });
});

describe('BuildPlan: a cut-off document or a metered continuation', () => {
  it('RF-604 RF-621 a PRD that stays cut off leaves placeholders and a warning that names the setting', async () => {
    const recording = await base();
    const h = await planned(cutAt(recording, 1, split(textOf(recording, 1), 4).slice(0, 3), true));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const warnings = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    const text = warnings.map((entry) => entry.message).join('\n');
    expect(text).toContain('Planner max output tokens');
  });

  it('RF-408 RF-613 the continuation is metered: one more call in the cost record, inside the high figure', async () => {
    const recording = await base();
    const [head = '', tail = ''] = split(textOf(recording, 0), 2);
    const h = await planned(cutAt(recording, 0, [head, tail]), true);

    const estimate = await h.estimate();
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('Completed');
    expect(h.providers.ledger.entries).toHaveLength(4);
    const worst = h.providers.ledger.reservations.map((each) => each.reservation.worstCase);
    const tokens = worst.reduce((sum, each) => sum + each.tokens, 0n);
    const { high } = estimate.planner.points;
    expect(tokens).toBeLessThanOrEqual(BigInt(high.inputTokens + high.outputTokens));
    const ids = h.providers.requests().map((request) => request.context.callId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('BuildPlan: a document that stays cut off is kept, marked and named', () => {
  it('RF-604 RF-621 a PRD that stays cut off opens with an Incomplete notice, is listed in the README and named in the run log', async () => {
    const recording = await base();
    const h = await planned(cutAt(recording, 1, split(textOf(recording, 1), 4).slice(0, 3), true));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const files = await h.handoffOf(run);
    const limit = String(h.providers.requests()[1]?.maxOutputTokens);
    expect(files['prd.md']?.startsWith('> **Incomplete.**')).toBe(true);
    expect(files['prd.md']).toContain(`cut off at ${limit} output tokens`);
    expect(files['README.md']).toContain('## Incomplete documents');
    expect(files['README.md']).toContain('- [Product requirements document](prd.md)');
    expect(files['data-model.md']).not.toContain('**Incomplete.**');
    const warnings = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    const named = warnings.some((entry) =>
      entry.message.includes('The product requirements document is incomplete'),
    );
    expect(named).toBe(true);
  });

  it('RF-604 RF-621 a PRD cut off once and then finished is not marked', async () => {
    const recording = await base();
    const [head = '', tail = ''] = split(textOf(recording, 1), 2);
    const h = await planned(cutAt(recording, 1, [head, tail]));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const files = await h.handoffOf(run);
    expect(files['prd.md']).not.toContain('Incomplete.');
    expect(files['README.md']).not.toContain('## Incomplete documents');
  });
});
