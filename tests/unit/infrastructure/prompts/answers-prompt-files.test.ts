import { describe, expect, it } from 'vitest';
import { loadAnswersPrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// DEC-198, RNF-004, RF-241: the answers prompt from v2 gives the owner's answers as owner facts, not
// as source to cite.

describe('the reader answers prompt', () => {
  it('DEC-198 is version 2 and names an answer an owner fact that is never cited', async () => {
    const file = await loadAnswersPrompt('prompts');

    expect(file.name).toBe('reader/answers.v2.md');
    expect(file.text).toMatch(/owner fact/iu);
    expect(file.text).toMatch(/never (?:a )?(?:source|evidence)/iu);
    expect(file.text).not.toContain('Raised from');
  });
});
