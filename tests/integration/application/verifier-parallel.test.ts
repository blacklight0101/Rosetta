import { describe, expect, it } from 'vitest';
import { judgeClaims } from '../../../src/application/understand/claim-judgement.js';
import { heldProvider, settle, slowReader, type Hold } from '../../support/parallel-judgement.js';
import { fixtureCards } from '../../support/verifier-cards.js';
import { verifierHarness, verifierRecording } from '../../support/verifier-harness.js';

// P5-15, RF-301, RF-1004, DEC-13, DEC-112: the verifier's judgements run in parallel within the
// caps, and what they give does not depend on the order in which the calls end.

/** What a run of the step gave: the claims, the events and the call ids per claim. */
interface Outcome {
  readonly cards: string;
  readonly events: string;
  readonly calls: string;
}

const fixtureDelays = new Map([
  ['Default.aspx.cs:8', 90],
  ['Default.aspx.cs:10', 70],
  ['Catalog/Details.aspx.cs:5', 50],
  ['Database/schema.sql:2', 30],
  ['Services/CatalogService.cs:12', 10],
]);

async function recordedRun(parallelism: number, scrambled: boolean): Promise<Outcome> {
  const h = await verifierHarness({
    recording: await verifierRecording('verifier-csharp-full.json'),
  });
  const held = heldProvider(h.parts.role.provider);
  const parts = h.step(parallelism);
  const judge = {
    ...parts.judge,
    role: { ...parts.judge.role, provider: held.provider },
    ...(scrambled ? { reader: slowReader(h.reader, fixtureDelays) } : {}),
  };
  const ended = { done: false };
  const running = judgeClaims(fixtureCards(), { ...parts, judge }).finally(() => {
    ended.done = true;
  });
  // With more than one at a time, wait until a full batch is held, then answer it last first.
  const batch = Math.min(parallelism, 5);
  const opened = new Set<Hold>();
  for (let spin = 0; spin < 2000 && !ended.done; spin += 1) {
    await settle(10);
    const waiting = held.holds.filter((each) => !opened.has(each));
    if (scrambled && waiting.length < batch && opened.size + waiting.length < 5) continue;
    for (const each of scrambled ? [...waiting].reverse() : waiting) {
      opened.add(each);
      each.open();
    }
  }
  const cards = await running;
  return {
    cards: JSON.stringify(cards),
    events: JSON.stringify(h.events.map((e) => [e.type, e.agentTaskId, e.data])),
    calls: JSON.stringify(
      h
        .requests()
        .map((r) => [r.context.agentTaskId, r.context.callId])
        .sort(),
    ),
  };
}

describe('P5-15 verifier judgements in parallel', () => {
  it('RF-301 a recorded run with parallelism 4 gives the same verdicts, events and call ids as parallelism 1, whatever order the calls end in', async () => {
    const one = await recordedRun(1, false);
    const four = await recordedRun(4, true);

    expect(four.cards).toBe(one.cards);
    expect(four.events).toBe(one.events);
    expect(four.calls).toBe(one.calls);
  });

  it('RF-301 the judgements run at the same time up to the parallelism and no more', async () => {
    const peak = async (parallelism: number): Promise<number> => {
      const h = await verifierHarness({
        recording: await verifierRecording('verifier-csharp-full.json'),
      });
      const held = heldProvider(h.parts.role.provider);
      const parts = h.step(parallelism);
      const judge = { ...parts.judge, role: { ...parts.judge.role, provider: held.provider } };
      const running = judgeClaims(fixtureCards(), { ...parts, judge });
      for (let round = 0; round < 8; round += 1) {
        await settle(30);
        for (const each of held.holds) each.open();
      }
      await running;
      return held.state.peak;
    };

    expect(await peak(1)).toBe(1);
    expect(await peak(4)).toBe(4);
  });
});
