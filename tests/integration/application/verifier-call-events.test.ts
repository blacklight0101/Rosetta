import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmResponse } from '../../../src/application/ports/llm-provider.js';
import { judgeClaims } from '../../../src/application/understand/claim-judgement.js';
import { judgeClaim, type ClaimJudgeParts } from '../../../src/application/verifier/judge-claim.js';
import type { Card } from '../../../src/domain/cards/card.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { fakeResponse, recordingOf } from '../../support/fake-recordings.js';
import { cardsOfTexts, hold, settle } from '../../support/parallel-judgement.js';
import {
  callEvents,
  callsInFlight,
  verifierHarness,
  type VerifierHarness,
} from '../../support/verifier-harness.js';

// RF-1002, RF-1015, RF-301, P8-58: the verifier pairs `verify.claim.started` with
// `verify.claim.callEnded` (same claim id), so a consumer counts the calls really in flight from the
// log alone: starts minus ends. `verify.claim.judged` cannot give that count, it leaves in claim order.

const supported: LlmResponse = fakeResponse({
  text: 'Reason: Line 8 loads the items.\nVerdict: Supported',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
  finishReason: 'stop',
});

const texts = (count: number): string[] =>
  Array.from({ length: count }, (_, n) => `The page loads item ${String(n + 1)}.`);

const idsOf = (cards: readonly Card[]): string[] =>
  cards.flatMap((card) => card.claims.map((claim) => claim.claimId));

const answering = (answer: () => Promise<LlmResponse>) => () => ({ complete: answer });

const words = (lines: readonly string[]): string[] => lines.map((line) => line.split(' ')[0] ?? '');

/** A provider that never answers by itself: it ends when the run is stopped, as a real call does. */
const waitsForStop: LlmProvider = {
  complete: (request) =>
    new Promise((_, reject) => {
      request.signal.addEventListener('abort', () => {
        reject(new RosettaError(ERROR_CODES.providerCallCancelled));
      });
    }),
};

/** A provider that holds the first answer and counts the calls it has in flight. */
function slowFirst(slow: { readonly opened: Promise<void> }) {
  const real = { calls: 0, active: 0, peak: 0 };
  const complete = async (): Promise<LlmResponse> => {
    real.calls += 1;
    real.active += 1;
    real.peak = Math.max(real.peak, real.active);
    try {
      if (real.calls === 1) await slow.opened;
      return supported;
    } finally {
      real.active -= 1;
    }
  };
  return { real, provider: answering(complete) };
}

/** One claim judged on its own; `whileWaiting` runs during its wait for the first call's turn. */
async function judgedAfterWait(
  h: Pick<VerifierHarness, 'parts'>,
  step: Pick<ClaimJudgeParts, 'halted'>,
  whileWaiting: () => void,
) {
  const cited = [{ path: 'Default.aspx.cs', startLine: 8, endLine: 12 }];
  const claim = { claimId: 'BR-001.c1', text: 'The page loads item 1.', citations: cited };
  const told: string[] = [];
  const tell = (word: string) => (each: { readonly claimId: string }) => {
    told.push(`${word} ${each.claimId}`);
    return Promise.resolve();
  };
  const wait = (): Promise<void> => {
    whileWaiting();
    return Promise.resolve();
  };
  const turn = { wait, pass: () => undefined };
  const onCall = { onCallStarted: tell('start'), onCallEnded: tell('end') };
  const parts = { ...h.parts, ...step, turn, ...onCall };
  const judgement = await judgeClaim(parts, claim, '0123456789abf001');
  return { judgement, told };
}

describe('P8-58 the calls in flight, counted from the log', () => {
  it('RF-1002 eight claims at parallelism 2 with the first one slow: the log counts 2 at most, and 0 at the end', async () => {
    const slow = hold();
    const { real, provider } = slowFirst(slow);
    const h = await verifierHarness({ recording: recordingOf(), provider });

    const running = judgeClaims(cardsOfTexts(texts(8)), h.step(2));
    await settle(300);
    // Seven claims are done, the first still runs: its verdict (and so every later one) waits for it.
    expect(callsInFlight(h.events)).toEqual({ peak: 2, min: 0, final: 1 });
    slow.open();
    await running;

    expect(real.peak).toBe(2);
    expect(callsInFlight(h.events)).toEqual({ peak: 2, min: 0, final: 0 });
  });

  it('RF-1002 a stop during the calls ends each started call: nothing stays in flight', async () => {
    const h = await verifierHarness({ recording: recordingOf(), provider: () => waitsForStop });

    const running = judgeClaims(cardsOfTexts(texts(4)), h.step(2));
    await settle();
    expect(callsInFlight(h.events)).toEqual({ peak: 2, min: 0, final: 2 });
    h.abort();
    await running;

    expect(callsInFlight(h.events)).toEqual({ peak: 2, min: 0, final: 0 });
    expect(words(callEvents(h.events))).toEqual(['start', 'start', 'end', 'end']);
  });
});

describe('P8-58 how a call ends', () => {
  it('RF-304 a cap that refuses a call after its start ends it, and the claims the cap halted have no start', async () => {
    let calls = 0;
    const refuse = (): Promise<LlmResponse> => {
      calls += 1;
      if (calls === 1) return Promise.resolve(supported);
      return Promise.reject(new RosettaError(ERROR_CODES.budgetCapReached));
    };
    const h = await verifierHarness({ recording: recordingOf(), provider: answering(refuse) });
    const cards = cardsOfTexts(texts(5));

    await judgeClaims(cards, h.step(1));

    const [first = '', second = ''] = idsOf(cards);
    expect(calls).toBe(2);
    expect(callEvents(h.events)).toEqual([
      `start ${first}`,
      `end ${first}`,
      `start ${second}`,
      `end ${second}`,
    ]);
  });

  it('RF-301 a call that throws ends: every claim has one start and one end, and nothing stays in flight', async () => {
    let calls = 0;
    const fail = (): Promise<LlmResponse> => {
      calls += 1;
      if (calls === 2) return Promise.reject(new RosettaError(ERROR_CODES.providerTimeout));
      return Promise.resolve(supported);
    };
    const h = await verifierHarness({ recording: recordingOf(), provider: answering(fail) });
    const cards = cardsOfTexts(texts(4));

    await judgeClaims(cards, h.step(4));

    const lines = callEvents(h.events);
    for (const id of idsOf(cards)) {
      expect(words(lines.filter((line) => line.endsWith(id)))).toEqual(['start', 'end']);
    }
    expect(callsInFlight(h.events)).toMatchObject({ min: 0, final: 0 });
  });
});

describe('P8-58 a retried judgement', () => {
  it('RF-301 an unreadable answer and its retry are one judgement: one start, one end after the retry', async () => {
    const answers = [fakeResponse({ ...supported, text: 'I do not know.' }), supported];
    let calls = 0;
    const answer = (): Promise<LlmResponse> => {
      calls += 1;
      return Promise.resolve(answers.shift() ?? supported);
    };
    const h = await verifierHarness({ recording: recordingOf(), provider: answering(answer) });

    await judgeClaims(cardsOfTexts(texts(1)), h.step(1));

    expect(calls).toBe(2);
    expect(callEvents(h.events)).toHaveLength(2);
    expect(callsInFlight(h.events)).toEqual({ peak: 1, min: 0, final: 0 });
  });
});

describe('P8-58 which claims have a call event', () => {
  it('RF-1002 a claim a rule decides and a claim that shares another one call have no start and no end', async () => {
    const answer = () => Promise.resolve(supported);
    const h = await verifierHarness({ recording: recordingOf(), provider: answering(answer) });
    const rule = 'The page loads the items, so the earlier claim that it is empty is wrong.';
    const cards = cardsOfTexts([rule, 'Same.', 'Same.', 'Other.']);

    await judgeClaims(cards, h.step(4));

    const [, second = '', , fourth = ''] = idsOf(cards);
    expect(callEvents(h.events).filter((line) => line.startsWith('start'))).toEqual([
      `start ${second}`,
      `start ${fourth}`,
    ]);
    expect(callEvents(h.events)).toHaveLength(4);
    expect(callsInFlight(h.events)).toMatchObject({ min: 0, final: 0 });
  });
});

describe('P8-58 a claim that waits for its turn', () => {
  it('RF-423 a claim the step halted while it waited for its turn sends no call and publishes no start', async () => {
    const h = await verifierHarness({ recording: recordingOf() });
    let halted: 'capped' | undefined;
    // The cap refuses another claim's call while this one waits for its turn.
    const whileWaiting = (): void => {
      halted = 'capped';
    };

    const { judgement, told } = await judgedAfterWait(h, { halted: () => halted }, whileWaiting);

    expect(judgement).toEqual({ kind: 'capped' });
    expect(told).toEqual([]);
    expect(h.requests()).toEqual([]);
  });

  it.each([
    ['a stop', undefined, 'stopped'],
    ['a cap', new RosettaError(ERROR_CODES.budgetCapReached), 'capped'],
  ])(
    'RF-1002 %s of the run while a claim waits for its turn: no request, no start and no end',
    async (_, reason, kind) => {
      const h = await verifierHarness({ recording: recordingOf() });

      const { judgement, told } = await judgedAfterWait(h, {}, () => {
        h.abort(reason);
      });

      expect(judgement).toEqual({ kind });
      expect(told).toEqual([]);
      expect(h.requests()).toEqual([]);
    },
  );
});
