import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';

// RF-1006, RNF-002: a page that stops reading during the replay does not make the server hold the
// live events of the run for it without end. Once the events held for it pass 1 MiB (the limit of
// live delivery) it is dropped; it reconnects with Last-Event-ID and the replay gives it the rest.

const NOTE = 'x'.repeat(300_000);

type Harness = ReturnType<typeof createRunHarness>;

interface StalledPage {
  readonly seqs: number[];
  readonly drops: { count: number };
  readonly replaying: Promise<void>;
}

/** A page that reads the first batch of stored events and then stops reading. */
async function openStalled(h: Harness, runId: string): Promise<StalledPage> {
  const seqs: number[] = [];
  const drops = { count: 0 };
  let wake: () => void = () => undefined;
  const stalled = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const subscribed = await h.subscribe.execute({
    actor: userAmy,
    runId,
    afterSeq: 0,
    onEvent: (event: RunEvent) => seqs.push(event.seq),
    onEnd: () => undefined,
    drained: () => stalled,
    onDrop: () => {
      drops.count += 1;
      wake();
    },
  });
  if (!subscribed.ok) throw new Error('Not subscribed');
  return { seqs, drops, replaying: subscribed.value.replay() };
}

describe('SubscribeRunEvents a page that stalls during the replay', () => {
  it('RF-1006 drops the page once the live events held for it pass 1 MiB and frees the subscription', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const events = h.executor.started[0]?.events;
    await events?.emit('agent.turn', { turn: 1 });
    const page = await openStalled(h, run.id);

    for (let turn = 2; turn <= 4; turn += 1) await events?.emit('agent.turn', { turn, note: NOTE });
    expect(page.drops.count).toBe(0);
    await events?.emit('agent.turn', { turn: 5, note: NOTE });

    expect(page.drops.count).toBe(1);
    await page.replaying;
    expect(page.seqs).toEqual([1, 2]);
    expect(h.broadcaster.subscriberCount).toBe(0);
  });

  it('RF-1006 replays the rest to the dropped page when it reconnects with the last seq it read', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const events = h.executor.started[0]?.events;
    await events?.emit('agent.turn', { turn: 1 });
    const page = await openStalled(h, run.id);
    for (let turn = 2; turn <= 5; turn += 1) await events?.emit('agent.turn', { turn, note: NOTE });
    await vi.waitFor(() => {
      expect(page.drops.count).toBe(1);
    });
    await page.replaying;
    const seqs: number[] = [];

    const again = await h.subscribe.execute({
      actor: userAmy,
      runId: run.id,
      afterSeq: page.seqs.at(-1) ?? 0,
      onEvent: (event: RunEvent) => seqs.push(event.seq),
      onEnd: () => undefined,
    });
    if (!again.ok) throw new Error('Not subscribed');
    await again.value.replay();
    await events?.emit('agent.turn', { turn: 6 });

    expect(seqs).toEqual([3, 4, 5, 6, 7]);
  });
});
