import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseCardOutput } from '../../../../src/application/cards/parse-cards.js';
import { renderRepairRequest } from '../../../../src/application/cards/repair-request.js';

// RF-202, RNF-004: the card format and the repair request are versioned prompt files, and they
// must stay in step with the schema that checks the answers.

const formatPrompt = await readFile('prompts/cards/card-format.v1.md', 'utf8');
const repairPrompt = await readFile('prompts/cards/repair.v1.md', 'utf8');

describe('card prompt files', () => {
  it('RF-202 the example answer in the card-format prompt passes the card schema', () => {
    const example = /```json\n([\s\S]*?)```/.exec(formatPrompt)?.[1] ?? '';

    const parsed = parseCardOutput(example);

    expect(parsed.ok && parsed.value).toHaveLength(1);
  });

  it('RF-202 the card-format prompt names every card type and confidence', () => {
    for (const word of ['FEAT', 'BR', 'ENT', 'INT', 'OQ', 'High', 'Medium', 'Low']) {
      expect(formatPrompt).toContain(`\`${word}\``);
    }
  });

  it('RF-202 the repair prompt has its one placeholder and takes the problems', () => {
    const text = renderRepairRequest(repairPrompt, [{ path: 'cards.0.title', message: 'Missing' }]);

    expect(repairPrompt.match(/\{\{problems\}\}/g)).toHaveLength(1);
    expect(text).toContain('- cards.0.title: Missing');
    expect(text).not.toContain('{{problems}}');
  });
});

const formatV2 = await readFile('prompts/cards/card-format.v2.md', 'utf8');

describe('card format prompt v2 (RF-243)', () => {
  it('RF-243 the example answer passes the card schema', () => {
    const example = /```json\n([\s\S]*?)```/.exec(formatV2)?.[1] ?? '';

    const parsed = parseCardOutput(example);

    expect(parsed.ok && parsed.value).toHaveLength(1);
  });

  it('RF-243 names every card type and confidence, as the first version does', () => {
    for (const word of ['FEAT', 'BR', 'ENT', 'INT', 'OQ', 'High', 'Medium', 'Low']) {
      expect(formatV2).toContain(`\`${word}\``);
    }
  });

  it('RF-243 tells the agent what an open question must hold and what it must not ask', () => {
    expect(formatV2).toMatch(/what the code shows/iu);
    expect(formatV2).toMatch(/business intent/iu);
    expect(formatV2).toMatch(/who uses/iu);
    expect(formatV2).toMatch(/never ask what the code, an area or the application does/iu);
  });

  it('RF-243 tells the agent that third-party or generated code gets no open question', () => {
    expect(formatV2).toMatch(/third-party or generated code/iu);
    expect(formatV2).toMatch(/no OQ card/iu);
  });
});
