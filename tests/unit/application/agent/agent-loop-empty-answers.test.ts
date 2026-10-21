import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { ScenarioOutcome } from '../../../contracts/llm-provider.contract.js';
import { cardObject } from '../../../support/card-output.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { textTurn, ungatedLoopSetup, usage } from '../../../support/agent-loop-harness.js';

// RF-402, RF-202, RF-208, Q-58, P3-86: a reasoning model that spends its whole output limit on
// hidden reasoning answers with empty text and `finishReason: length`. That answer is not asked
// to continue: the call is made once more with the limit doubled (never above the largest limit a
// role accepts), and the event names the reason. Synthetic shape of the live run of 2026-10-21
// (OpenAI gpt-5-nano, reader limit 4,096): empty text, 4,096 output tokens, all of them reasoning.

const whole = JSON.stringify({ cards: [cardObject({ title: 'Checkout' })] });

/** The recorded answer: no text, the whole limit used, every output token spent on reasoning. */
function emptyAtLimit(limit: number): ScenarioOutcome {
  return {
    response: {
      text: '',
      toolCalls: [],
      usage: { ...usage, inputTokens: 900, outputTokens: limit, reasoningTokens: limit },
      finishReason: 'length',
    },
    retried: [],
  };
}

function noteCollector(): {
  readonly notes: unknown[];
  readonly onNote: (note: unknown) => Promise<void>;
} {
  const notes: unknown[] = [];
  return {
    notes,
    onNote: (note) => {
      notes.push(note);
      return Promise.resolve();
    },
  };
}

describe('P3-86 an empty answer at the output limit', () => {
  it('RF-402 is retried once with the limit doubled and its cards are kept', async () => {
    const { notes, onNote } = noteCollector();
    const { fake, request } = ungatedLoopSetup([emptyAtLimit(4096), textTurn(whole)], {
      maxOutputTokens: 4096,
    });

    const result = await runAgentTask({ ...request(fake), onNote });

    expect(result.state).toBe('Done');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout']);
    expect(fake.requests.map((each) => each.maxOutputTokens)).toEqual([4096, 8192]);
    expect(fake.requests[1]?.messages).toEqual(fake.requests[0]?.messages);
    expect(fake.requests[1]?.context.callId).not.toBe(fake.requests[0]?.context.callId);
    expect(notes).toEqual([{ outcome: 'retried', reason: 'empty-at-limit' }]);
  });

  it('RF-402 counts both calls in the task usage, reasoning tokens as output', async () => {
    const { fake, request } = ungatedLoopSetup([emptyAtLimit(4096), textTurn(whole)], {
      maxOutputTokens: 4096,
    });

    const result = await runAgentTask(request(fake));

    expect(result.turns).toBe(2);
    expect(result.usage.outputTokens).toBe(4096 + usage.outputTokens);
  });

  it('RF-402 a second empty answer ends the task as today and the event says so', async () => {
    const { notes, onNote } = noteCollector();
    const { fake, request } = ungatedLoopSetup(
      [emptyAtLimit(4096), emptyAtLimit(8192), emptyAtLimit(8192), emptyAtLimit(8192)],
      { maxOutputTokens: 4096 },
    );

    const result = await runAgentTask({ ...request(fake), onNote });

    expect(result.state).toBe('InvalidOutput');
    expect(result.drafts).toEqual([]);
    expect(fake.requests.map((each) => each.maxOutputTokens)).toEqual([4096, 8192, 8192, 8192]);
    expect(notes).toEqual([
      { outcome: 'retried', reason: 'empty-at-limit' },
      { outcome: 'empty', reason: 'after-retry' },
    ]);
  });
});

describe('P3-86 the doubled limit', () => {
  it('RF-402 stops at the largest limit a role accepts', async () => {
    const { fake, request } = ungatedLoopSetup([emptyAtLimit(20_000), textTurn(whole)], {
      maxOutputTokens: 20_000,
    });

    await runAgentTask(request(fake));

    expect(fake.requests.map((each) => each.maxOutputTokens)).toEqual([20_000, 32_768]);
  });

  it('RF-402 a limit already at the largest is not retried; the event says there was no room', async () => {
    const { notes, onNote } = noteCollector();
    const { fake, request } = ungatedLoopSetup(
      [emptyAtLimit(32_768), emptyAtLimit(32_768), emptyAtLimit(32_768)],
      { maxOutputTokens: 32_768 },
    );

    const result = await runAgentTask({ ...request(fake), onNote });

    expect(result.state).toBe('InvalidOutput');
    expect(fake.requests.map((each) => each.maxOutputTokens)).toEqual([32_768, 32_768, 32_768]);
    expect(notes).toEqual([{ outcome: 'empty', reason: 'no-room' }]);
  });
});

describe('P3-86 the retry goes through the guards', () => {
  it('Q-58 a retry the budget guard refuses ends the task as capped, nothing else is called', async () => {
    const seen: LlmRequest[] = [];
    const first: LlmResponse = fakeResponse({
      text: '',
      toolCalls: [],
      usage: { ...usage, outputTokens: 4096, reasoningTokens: 4096 },
      finishReason: 'length',
    });
    const refusing: LlmProvider = {
      complete: (call) => {
        seen.push(call);
        if (seen.length === 1) return Promise.resolve(first);
        return Promise.reject(new RosettaError(ERROR_CODES.budgetCapReached));
      },
    };
    const { request } = ungatedLoopSetup([], { maxOutputTokens: 4096 });

    const result = await runAgentTask(request(refusing));

    expect(seen.map((each) => each.maxOutputTokens)).toEqual([4096, 8192]);
    expect(result.state).toBe('StoppedByCap');
    expect(result.code).toBe(ERROR_CODES.budgetCapReached);
  });
});

describe('P3-86 an answer cut with text', () => {
  it('RF-208 still gets the continuation as today, at the same limit, and no retry', async () => {
    const cut = whole.slice(0, whole.indexOf('creates an order') + 6);
    const { notes, onNote } = noteCollector();
    const { fake, request } = ungatedLoopSetup(
      [
        {
          response: { text: cut, toolCalls: [], usage, finishReason: 'length' },
          retried: [],
        },
        textTurn(whole.slice(cut.length)),
      ],
      { maxOutputTokens: 4096 },
    );

    const result = await runAgentTask({ ...request(fake), onNote });

    expect(result.state).toBe('Done');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout']);
    expect(fake.requests.map((each) => each.maxOutputTokens)).toEqual([4096, 4096]);
    expect(fake.requests[1]?.messages.length).toBeGreaterThan(
      fake.requests[0]?.messages.length ?? 0,
    );
    expect(notes).toEqual([]);
  });

  it('RF-402 an empty answer that stopped on its own is not retried', async () => {
    const { fake, request } = ungatedLoopSetup([textTurn(''), textTurn(''), textTurn('')], {
      maxOutputTokens: 4096,
    });

    await runAgentTask(request(fake));

    expect(fake.requests.map((each) => each.maxOutputTokens)).toEqual([4096, 4096, 4096]);
  });
});
