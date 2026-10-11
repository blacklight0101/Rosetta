import { describe, expect, it } from 'vitest';
import { llmResponseOf } from '../../../../../src/infrastructure/providers/ollama/ollama-response.js';
import type { OllamaChat } from '../../../../../src/infrastructure/providers/ollama/ollama-wire.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';

// RF-401, RF-408, RF-421: Ollama's answer in the port's one shape.

const digest = 'sha-digest';

function chat(overrides: Partial<OllamaChat> = {}): OllamaChat {
  return {
    message: { content: 'Answer.' },
    done_reason: 'stop',
    prompt_eval_count: 100,
    eval_count: 20,
    load_duration: 1_500_000,
    prompt_eval_duration: 2_000_000,
    eval_duration: 500_000_000,
    ...overrides,
  };
}

function answer(overrides: Partial<OllamaChat> = {}, toolMode: 'native' | 'text' = 'native') {
  return llmResponseOf(chat(overrides), {
    request: contractRequest(),
    toolMode,
    modelVersion: digest,
  });
}

describe('Ollama answer', () => {
  it('RF-401 maps text, reported usage and the digest as the model version', () => {
    expect(answer()).toEqual({
      text: 'Answer.',
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 0, usageSource: 'reported' },
      finishReason: 'stop',
      modelVersion: digest,
      metrics: {
        httpStatus: 200,
        ollama: {
          loadDurationMs: 2,
          promptEvalDurationMs: 2,
          evalDurationMs: 500,
          tokensPerSecond: 40,
        },
      },
    });
  });

  it('RF-408 tokens per second is 0 when Ollama reports no generation time', () => {
    const response = answer({ eval_duration: 0 });

    expect(response.metrics?.ollama?.tokensPerSecond).toBe(0);
  });

  it('RF-408 missing durations are recorded as 0', () => {
    const response = answer({
      load_duration: undefined,
      prompt_eval_duration: undefined,
      eval_duration: undefined,
    });

    expect(response.metrics?.ollama).toEqual({
      loadDurationMs: 0,
      promptEvalDurationMs: 0,
      evalDurationMs: 0,
      tokensPerSecond: 0,
    });
  });

  it('RF-421 usage Ollama does not report is estimated and marked estimated', () => {
    const response = answer({
      prompt_eval_count: undefined,
      eval_count: undefined,
      message: { content: '12345678' },
    });

    expect(response.usage).toEqual({
      inputTokens: 52,
      outputTokens: 2,
      cachedInputTokens: 0,
      usageSource: 'estimated',
    });
  });

  it.each([
    ['stop', 'stop'],
    ['length', 'length'],
    ['load', 'stop'],
    [undefined, 'stop'],
  ] as const)('RF-401 done reason %s is the finish reason %s', (doneReason, finishReason) => {
    expect(answer({ done_reason: doneReason }).finishReason).toBe(finishReason);
  });

  it('RF-401 native tool calls are numbered and finish with tool_use', () => {
    const response = answer({
      message: {
        content: '',
        tool_calls: [{ function: { name: 'grep', arguments: { pattern: 'x' } } }],
      },
    });

    expect(response.toolCalls).toEqual([
      { id: 'call-1', name: 'grep', arguments: { pattern: 'x' } },
    ]);
    expect(response.finishReason).toBe('tool_use');
  });

  it('RF-205 a native tool call that fails validation is kept as text, not dropped', () => {
    const response = answer({
      message: { content: 'Calling.', tool_calls: [{ function: { arguments: {} } }] },
    });

    expect(response.toolCalls).toEqual([]);
    expect(response.text).toBe('Calling.\n{"function":{"arguments":{}}}');
  });

  it('RF-205 in text mode tool calls are read from the text', () => {
    const response = answer(
      { message: { content: '{"name": "grep", "arguments": {"pattern": "x"}}' } },
      'text',
    );

    expect(response.toolCalls).toEqual([
      { id: 'call-1', name: 'grep', arguments: { pattern: 'x' } },
    ]);
    expect(response.text).toBe('');
  });

  it('RF-401 thinking in its own field never reaches the answer', () => {
    const response = answer({ message: { content: 'Answer.', thinking: 'secret plan' } });

    expect(response.text).toBe('Answer.');
  });
});
