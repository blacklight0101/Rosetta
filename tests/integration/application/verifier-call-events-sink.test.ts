import { describe, expect, it } from 'vitest';
import type { LlmResponse } from '../../../src/application/ports/llm-provider.js';
import type { RunEventSink } from '../../../src/application/ports/run-events.js';
import { RunEventPublisher } from '../../../src/application/runs/run-event-publisher.js';
import { judgeClaims } from '../../../src/application/understand/claim-judgement.js';
import { MemoryEventSink } from '../../../src/infrastructure/events/memory-event-sink.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { fakeResponse, recordingOf } from '../../support/fake-recordings.js';
import { cardsOfTexts, hold, settle } from '../../support/parallel-judgement.js';
import { scopeFor } from '../../support/run-event-fixtures.js';
import { callEvents, verifierHarness } from '../../support/verifier-harness.js';

// RF-1002, RF-1006, P8-58: the call events and the run's event publisher. The publisher queues an
// emit and writes it later, so "before the call" means queued before the request is sent, and the
// start is written before the end. A failed write of a call event never loses a call already sent
// (and billed) and never ends in an unhandled rejection; the step fails once the calls are over.

const supported: LlmResponse = fakeResponse({
  text: 'Reason: Line 8 loads the items.\nVerdict: Supported',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
  finishReason: 'stop',
});

type Emit = Parameters<typeof judgeClaims>[1]['events']['emit'];

describe('P8-58 the call events through the real publisher', () => {
  it('RF-1002 the start is queued before the call is sent, written before the end, and a slow sink holds no call back', async () => {
    const gate = hold();
    const memory = new MemoryEventSink();
    const timeline: string[] = [];
    const sink: RunEventSink = {
      publish: async (scope, event) => {
        await gate.opened;
        await memory.publish(scope, event);
        timeline.push(`written ${event.type}`);
      },
    };
    const scope = scopeFor('20261012-100000-understand');
    const clock = new FixedClock('2026-10-12T10:00:00.000Z');
    const publisher = await RunEventPublisher.open({ scope, sink, history: memory, clock });
    const h = await verifierHarness({
      recording: recordingOf(),
      provider: () => ({
        complete: () => {
          timeline.push('call sent');
          return Promise.resolve(supported);
        },
      }),
    });
    const emit: Emit = (type, data, agentTaskId) => {
      timeline.push(`queued ${type}`);
      return publisher.emit(type, data, agentTaskId);
    };

    const running = judgeClaims(cardsOfTexts(['The page loads item 1.']), {
      ...h.step(),
      events: { emit },
    });
    await settle();
    // The sink has written nothing yet and the call is already sent.
    expect(timeline).toEqual(['queued verify.claim.started', 'call sent']);
    gate.open();
    await running;

    expect(timeline).toEqual([
      ...['queued verify.claim.started', 'call sent', 'written verify.claim.started'],
      ...['queued verify.claim.callEnded', 'written verify.claim.callEnded'],
      ...['queued verify.claim.judged', 'written verify.claim.judged'],
    ]);
    expect((await memory.read(scope, 0)).map((event) => event.seq)).toEqual([1, 2, 3]);
  });
});

/** A step whose emit of `failing` rejects as a full disk does; the other events are kept. */
async function failingStep(failing: string, answer: Promise<LlmResponse>, answered: string[]) {
  const h = await verifierHarness({
    recording: recordingOf(),
    provider: () => ({ complete: () => answer }),
  });
  const emit: Emit = (type, data, agentTaskId) => {
    if (type === failing) return Promise.reject(new Error('disk full'));
    return h.step().events.emit(type, data, agentTaskId);
  };
  const step = h.step();
  const onAnswer = (response: LlmResponse): Promise<void> => {
    answered.push(response.text);
    return Promise.resolve();
  };
  return { h, parts: { ...step, judge: { ...step.judge, onAnswer }, events: { emit } } };
}

describe('P8-58 a call event that cannot be written', () => {
  it('RF-301 a failed start while the call is pending is no unhandled rejection; the answer is recorded and the step fails after it', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const slow = hold();
      const answered: string[] = [];
      const answer = slow.opened.then(() => supported);
      const { h, parts } = await failingStep('verify.claim.started', answer, answered);

      const running = judgeClaims(cardsOfTexts(['The page loads item 1.']), parts);
      const outcome = running.then(
        () => 'ended',
        (error: unknown) => String(error),
      );
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(unhandled).toEqual([]);
      expect(answered).toEqual([]);
      slow.open();
      expect(await outcome).toContain('disk full');

      expect(answered).toEqual([supported.text]);
      expect(callEvents(h.events)).toEqual(['end FEAT-001.c1']);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('RF-301 a failed end is thrown after the verdict was recorded', async () => {
    const answered: string[] = [];
    const { h, parts } = await failingStep(
      'verify.claim.callEnded',
      Promise.resolve(supported),
      answered,
    );

    await expect(judgeClaims(cardsOfTexts(['The page loads item 1.']), parts)).rejects.toThrow(
      'disk full',
    );

    expect(answered).toEqual([supported.text]);
    expect(callEvents(h.events)).toEqual(['start FEAT-001.c1']);
  });
});
