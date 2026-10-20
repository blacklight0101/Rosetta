import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';
import { refusal, smallOutput } from '../../../../support/ollama-prompt-size.js';

// RF-401, RF-421, RF-428, DEC-155: a call whose prompt Ollama reports it cut fails, with the tokens
// it reported, and a prompt it read whole is answered (ADR-008).

const start = useFakeOllama();

describe('OllamaProvider when Ollama cut the prompt', () => {
  it('RF-401 fails a call whose reported prompt tokens are far below a large estimate', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });

    const error = await refusal(provider.complete(smallOutput(1900, 'planner')));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.notSent).toBe(false);
    expect(error.message).toContain('900');
    expect(error.message).toContain('1900');
    expect(error.message).toContain('2048');
    expect(error.message).toContain('planner');
    expect(error.message).toMatch(/cloud model/);
  });

  it('RF-401 RF-428 the failure carries the reported tokens, and the answer is dropped', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });

    const error = await refusal(provider.complete(smallOutput(1900)));

    expect(error.usage).toEqual({
      inputTokens: 900,
      outputTokens: 80,
      cachedInputTokens: 0,
      usageSource: 'reported',
    });
    expect(error.message).not.toContain('Catalog area lists');
  });
});

describe('OllamaProvider when Ollama cut the prompt (auto context and roles)', () => {
  it('RF-401 fails the same way against an auto context', async () => {
    const { provider } = await start('prompt-cut-auto');

    const error = await refusal(provider.complete(smallOutput(7000)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.message).toContain('8192');
  });

  it.each(['reader', 'verifier', 'planner'] as const)(
    'RF-401 fails a cut prompt of the %s role',
    async (role) => {
      const { provider } = await start('prompt-cut', { contextTokens: 2048 });

      const error = await refusal(provider.complete(smallOutput(1900, role)));

      expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
      expect(error.message).toContain(role);
    },
  );
});

describe('OllamaProvider cut-prompt rule boundaries', () => {
  it('RF-401 does not call a prompt cut when its estimate is below four fifths of the context', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });

    const response = await provider.complete(smallOutput(1638));

    expect(response.usage.inputTokens).toBe(900);
  });

  it('RF-401 calls a prompt cut from four fifths of the context up', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });

    const error = await refusal(provider.complete(smallOutput(1639)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
  });

  it('RF-401 does not call a prompt cut when the reported count is 70 percent of the estimate', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 1536 });

    const response = await provider.complete(smallOutput(1285));

    expect(response.usage.inputTokens).toBe(900);
  });

  it('RF-401 calls a prompt cut when the reported count is below 70 percent of the estimate', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 1536 });

    const error = await refusal(provider.complete(smallOutput(1286)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
  });

  it('RF-401 answers a large prompt whose reported count agrees with the estimate', async () => {
    const { provider } = await start('prompt-counted-full', { contextTokens: 2048 });

    const response = await provider.complete(smallOutput(1900));

    expect(response.usage.inputTokens).toBe(1900);
  });

  it('RF-401 RF-421 answers a large prompt when Ollama reports no counts', async () => {
    const { provider } = await start('usage-missing', { contextTokens: 2048 });

    const response = await provider.complete(smallOutput(1900));

    expect(response.usage.usageSource).toBe('estimated');
  });
});
