import { describe, expect, it } from 'vitest';
import { WORKBOOK_PROMPT_TOKENS } from '../../../src/application/estimate/estimate-assumptions.js';
import { loadReaderPrompts } from '../../../src/infrastructure/prompts/prompt-files.js';

// RF-425, RF-155 (P3-68): the estimate adds a fixed number of tokens for the workbook guidance of the
// reader prompt. It must stay in step with the prompt file the run loads: at least the prompt's size
// (the estimate is never under-counted) and not far more (it is "more than its size", not a guess).

const CHARS_PER_TOKEN = 4;
const MARGIN_TOKENS = 100;

describe('the workbook guidance in the estimate', () => {
  it('RF-425 WORKBOOK_PROMPT_TOKENS matches the size of the workbook prompt file', async () => {
    const prompts = await loadReaderPrompts('prompts');
    const text = prompts.workbook?.text ?? '';
    expect(text.length).toBeGreaterThan(0);

    const size = Math.ceil(text.length / CHARS_PER_TOKEN);

    expect(WORKBOOK_PROMPT_TOKENS).toBeGreaterThanOrEqual(size);
    expect(WORKBOOK_PROMPT_TOKENS).toBeLessThanOrEqual(size + MARGIN_TOKENS);
  });
});
