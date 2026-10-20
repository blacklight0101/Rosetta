import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import {
  cutPrompt,
  type PromptFacts,
} from '../../../../../src/infrastructure/providers/ollama/ollama-prompt-guard.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';

// RF-401, DEC-155: the after-call rule fires only when the prompt could not have fitted (its
// estimate is over the context) and Ollama read under 70 percent of the estimate.

const facts = (estimatedTokens: number): PromptFacts => ({
  role: 'planner',
  model: 'm',
  estimatedTokens,
  outputTokens: 0,
  contextTokens: 2048,
});

const chat = (reported: number | undefined) => ({
  message: { role: 'assistant', content: 'x' },
  ...(reported === undefined ? {} : { prompt_eval_count: reported }),
  eval_count: 80,
});

describe('cutPrompt', () => {
  it('RF-401 fails an estimate over the context with a reported count far below it', () => {
    const failed = cutPrompt(facts(3000), chat(900), contractRequest());

    expect(failed?.failure.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(failed?.usage).toMatchObject({ inputTokens: 900, outputTokens: 80 });
    expect(failed?.message).toContain('900');
    expect(failed?.message).toContain('3000');
    expect(failed?.message).toContain('planner');
    expect(failed?.notSent).toBeUndefined();
  });

  it('RF-401 never fails an estimate that fits, whatever the reported count', () => {
    expect(cutPrompt(facts(2048), chat(1), contractRequest())).toBeUndefined();
    expect(cutPrompt(facts(1843), chat(900), contractRequest())).toBeUndefined();
  });

  it('RF-401 does not fail a reported count at 70 percent of the estimate', () => {
    expect(cutPrompt(facts(3000), chat(2100), contractRequest())).toBeUndefined();
    expect(cutPrompt(facts(3000), chat(2099), contractRequest())).toBeDefined();
  });

  it('RF-401 does not fail when Ollama reports no prompt count', () => {
    expect(cutPrompt(facts(3000), chat(undefined), contractRequest())).toBeUndefined();
  });
});
