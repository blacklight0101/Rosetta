import { describe, expect, it } from 'vitest';
import type { LlmResponse } from '../../../src/application/ports/llm-provider.js';
import type { RepositoryReader } from '../../../src/application/ports/repository-reader.js';
import { judgeClaims } from '../../../src/application/understand/claim-judgement.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { fakeResponse } from '../../support/fake-recordings.js';
import { cardsOfTexts, hold, settle } from '../../support/parallel-judgement.js';
import { fixtureCards } from '../../support/verifier-cards.js';
import { verifierHarness, verifierRecording } from '../../support/verifier-harness.js';
import { recordingOf } from '../../support/fake-recordings.js';

// P5-15, RF-301, EV-06: the first calls of parallel judgements leave in claim order, a repeated
// claim does not hold the turn, and a claim that throws does not stop the others.

const supported: LlmResponse = fakeResponse({
  text: 'Reason: Line 8 loads the items.\nVerdict: Supported',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
  finishReason: 'stop',
});

/** Fails a test that waits longer than a few seconds, so a stalled step cannot hang CI. */
function within<T>(work: Promise<T>): Promise<T> {
  const limit = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('The step did not end in time.'));
    }, 5000);
  });
  return Promise.race([work, limit]);
}

/** A reader whose reads take fewer ticks each time, so later requests are served first. */
function speedingReader(reader: RepositoryReader): Pick<RepositoryReader, 'readLines'> {
  let reads = 0;
  return {
    readLines: async (range) => {
      reads += 1;
      await settle(Math.max(0, 60 - reads * 10));
      return reader.readLines(range);
    },
  };
}

describe('P5-15 the first calls leave in claim order', () => {
  it('RF-301 files that read faster the later they are asked for still send the first calls in claim order', async () => {
    const h = await verifierHarness({
      recording: await verifierRecording('verifier-csharp-full.json'),
    });
    const step = h.step(4);

    await judgeClaims(fixtureCards(), {
      ...step,
      judge: { ...step.judge, reader: speedingReader(h.reader) },
    });

    expect(h.requests().map((request) => request.context.agentTaskId)).toEqual([
      'verifier-FEAT-001.c1',
      'verifier-OQ-001.c1',
      'verifier-BR-001.c1',
      'verifier-ENT-001.c1',
      'verifier-BR-002.c1',
    ]);
  });
});

describe('P5-15 a repeated claim', () => {
  it('EV-06 a claim that repeats an earlier one does not hold the later claims back from their first calls', async () => {
    const first = hold();
    let calls = 0;
    const h = await verifierHarness({
      recording: recordingOf(),
      provider: () => ({
        complete: async () => {
          calls += 1;
          if (calls === 1) await first.opened;
          return supported;
        },
      }),
    });
    const texts = ['Same.', 'Same.', 'Other one.', 'Third one.', 'Fourth one.'];

    const running = judgeClaims(cardsOfTexts(texts), h.step(4));
    await settle(200);

    expect(calls).toBe(4);
    first.open();
    const cards = await within(running);
    expect(cards.flatMap((card) => card.claims).map((claim) => claim.status)).toEqual(
      Array(5).fill('Supported'),
    );
  });
});

describe('P5-15 a failing claim', () => {
  it('RF-301 a claim whose call throws is left Unverified and the later claims are still judged', async () => {
    let calls = 0;
    const h = await verifierHarness({
      recording: recordingOf(),
      provider: () => ({
        complete: () => {
          calls += 1;
          if (calls === 1) return Promise.reject(new RosettaError(ERROR_CODES.providerTimeout));
          return Promise.resolve(supported);
        },
      }),
    });

    const cards = await within(
      judgeClaims(cardsOfTexts(['A.', 'B.', 'C.', 'D.', 'E.']), h.step(4)),
    );

    expect(cards.flatMap((card) => card.claims).map((claim) => claim.status)).toEqual([
      'Unverified',
      'Supported',
      'Supported',
      'Supported',
      'Supported',
    ]);
    expect(h.events).toHaveLength(5);
  });
});
