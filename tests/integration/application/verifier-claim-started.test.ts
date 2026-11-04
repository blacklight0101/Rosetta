import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '../../../src/application/ports/llm-provider.js';
import { judgeClaims } from '../../../src/application/understand/claim-judgement.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { fixtureCards } from '../../support/verifier-cards.js';
import { verifierHarness, verifierRecording } from '../../support/verifier-harness.js';

// RF-1002, RF-1015, RF-301: the verifier publishes `verify.claim.started` with the claim's id when
// its judgement call begins, so the live page can say how many calls the verifier runs at once.

const STARTED = 'verify.claim.started';

async function watched() {
  const sentAfter: string[][] = [];
  const holder: { events: readonly { type: string; data: Readonly<Record<string, unknown>> }[] } = {
    events: [],
  };
  const h = await verifierHarness({
    recording: await verifierRecording('verifier-csharp-full.json'),
    provider: (fake): LlmProvider => ({
      complete: (request) => {
        sentAfter.push(
          holder.events.filter((e) => e.type === STARTED).map((e) => String(e.data['claimId'])),
        );
        return fake.complete(request);
      },
    }),
  });
  holder.events = h.events;
  return { h, sentAfter };
}

describe('verify.claim.started', () => {
  it('RF-1002 a judgement call publishes verify.claim.started with the claim id and its task, requested before the call', async () => {
    const { h, sentAfter } = await watched();

    await judgeClaims(fixtureCards(), h.step());

    const started = h.events.filter((event) => event.type === STARTED);
    expect(started.map((event) => [event.data, event.agentTaskId])).toEqual([
      [{ claimId: 'FEAT-001.c1' }, 'reader-001'],
      [{ claimId: 'OQ-001.c1' }, 'reader-001'],
      [{ claimId: 'BR-001.c1' }, 'reader-002'],
      [{ claimId: 'BR-002.c1' }, 'reader-003'],
      [{ claimId: 'ENT-001.c1' }, 'reader-004'],
    ]);
    // The harness emit records at once, so this is the order of the requests; the real publisher
    // queues, and its order is proved in verifier-call-events-sink.test.ts.
    expect(sentAfter.map((ids) => ids.length)).toEqual([1, 2, 3, 4, 5]);
  });

  it('RF-1015 each claim starts before its verdict, with the starts in claim order at parallelism 4', async () => {
    const { h } = await watched();

    await judgeClaims(fixtureCards(), h.step(4));

    const ids = (type: string) =>
      h.events.filter((e) => e.type === type).map((e) => String(e.data['claimId']));
    expect(ids(STARTED)).toEqual(ids('verify.claim.judged'));
    for (const claimId of ids('verify.claim.judged')) {
      const start = h.events.findIndex((e) => e.type === STARTED && e.data['claimId'] === claimId);
      const end = h.events.findIndex(
        (e) => e.type === 'verify.claim.judged' && e.data['claimId'] === claimId,
      );
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThan(end);
    }
  });

  it('RF-301 a run stopped by a cap sends no call and publishes no start', async () => {
    const { h } = await watched();
    h.abort(new RosettaError(ERROR_CODES.budgetCapReached));

    await judgeClaims(fixtureCards(), h.step());

    expect(h.events.some((event) => event.type === STARTED)).toBe(false);
    expect(h.requests()).toEqual([]);
  });
});
