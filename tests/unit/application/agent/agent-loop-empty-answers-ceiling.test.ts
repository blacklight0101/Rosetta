import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import type { ScenarioOutcome } from '../../../contracts/llm-provider.contract.js';
import { cardObject } from '../../../support/card-output.js';
import { textTurn, ungatedLoopSetup, usage } from '../../../support/agent-loop-harness.js';

// RF-402, Q-58, P3-100: the empty-answer retry doubles the output limit up to the maximum output
// the model lists (32,768 when the list gives none).

const whole = JSON.stringify({ cards: [cardObject({ title: 'Checkout' })] });

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

describe('P3-100 the doubled limit follows the maximum the model lists', () => {
  const ceiling = (maxOutputCeiling: number, maxOutputTokens: number) => ({
    maxOutputTokens,
    maxOutputCeiling,
  });

  it('RF-402 a limit of 16,384 on a model with a 128,000 maximum doubles to 32,768', async () => {
    const { fake, request } = ungatedLoopSetup(
      [emptyAtLimit(16_384), textTurn(whole)],
      ceiling(128_000, 16_384),
    );

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(fake.requests.map((each) => each.maxOutputTokens)).toEqual([16_384, 32_768]);
  });

  it('RF-402 the doubled limit never passes the model maximum', async () => {
    const { fake, request } = ungatedLoopSetup(
      [emptyAtLimit(100_000), textTurn(whole)],
      ceiling(128_000, 100_000),
    );

    await runAgentTask(request(fake));

    expect(fake.requests.map((each) => each.maxOutputTokens)).toEqual([100_000, 128_000]);
  });
});

describe('P3-100 the doubled limit again after a good retry', () => {
  const ceiling = (maxOutputCeiling: number, maxOutputTokens: number) => ({
    maxOutputTokens,
    maxOutputCeiling,
  });

  it('RF-402 a later empty answer after a good retry is doubled again, up to the maximum', async () => {
    const { fake, request } = ungatedLoopSetup(
      [emptyAtLimit(16_384), textTurn('{"x":'), emptyAtLimit(32_768), textTurn(whole)],
      ceiling(128_000, 16_384),
    );

    await runAgentTask(request(fake));

    expect(fake.requests.slice(0, 3).map((each) => each.maxOutputTokens)).toEqual([
      16_384, 32_768, 32_768,
    ]);
  });

  it('RF-402 a limit already at the model maximum is not retried', async () => {
    const { notes, onNote } = noteCollector();
    const { fake, request } = ungatedLoopSetup(
      [emptyAtLimit(8_192), emptyAtLimit(8_192), emptyAtLimit(8_192)],
      ceiling(8_192, 8_192),
    );

    await runAgentTask({ ...request(fake), onNote });

    expect(fake.requests.map((each) => each.maxOutputTokens)).toEqual([8_192, 8_192, 8_192]);
    expect(notes).toEqual([{ outcome: 'empty', reason: 'no-room' }]);
  });
});
