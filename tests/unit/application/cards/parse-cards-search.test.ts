import { describe, expect, it } from 'vitest';
import { cardLimits } from '../../../../src/application/cards/card-limits.js';
import { parseCardOutput } from '../../../../src/application/cards/parse-cards.js';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import { cardObject, cardsJson, problemsOf } from '../../../support/card-output.js';

const junkFence = '```\nnot json\n```\n';

describe('parseCardOutput tells prose braces from cut-off JSON', () => {
  it.each(['use {x} here', 'set [a] and {b, c} first', 'a {broken thought'])(
    'RF-202 prose with only braces (%s) is reported as holding no JSON, not as cut off',
    (raw) => {
      const messages = problemsOf(raw).map((problem) => problem.message);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatch(/No JSON found/);
    },
  );

  it('RF-202 a JSON object cut off right after its opening brace is reported as cut off', () => {
    expect(problemsOf('Here: {"cards": [{"type"')[0]?.message).toMatch(/cut off/);
    expect(problemsOf('```json\n{\n```')[0]?.message).toMatch(/cut off/);
  });
});

describe('parseCardOutput says why it found no cards', () => {
  it('RF-202 a truncated answer is reported as cut off, not as missing JSON', () => {
    const cut = cardsJson().slice(0, -15);

    const messages = problemsOf(`Here you go:\n${cut}`).map((problem) => problem.message);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/cut off|not valid/i);
    expect(messages[0]).not.toMatch(/No JSON found/);
  });

  it('RF-202 an answer without any bracket is reported as holding no JSON', () => {
    expect(problemsOf('Nothing to report.')[0]?.message).toMatch(/No JSON found/);
  });

  it('RF-202 hitting the candidate cap is reported as such, not as missing JSON', () => {
    const tail = Array.from({ length: cardLimits.maxJsonCandidates + 1 }, () => junkFence);
    const raw = `\`\`\`json\n${cardsJson()}\n\`\`\`\n${tail.join('')}`;

    const messages = problemsOf(raw).map((problem) => problem.message);

    expect(messages.join(' ')).toMatch(new RegExp(`first ${String(cardLimits.maxJsonCandidates)}`));
    expect(messages.join(' ')).not.toMatch(/No JSON found/);
  });

  it('RF-202 a valid answer after a few code fences is still found', () => {
    const lead = Array.from({ length: 4 }, () => junkFence).join('');

    expect(parseCardOutput(`${lead}\`\`\`json\n${cardsJson()}\n\`\`\``).ok).toBe(true);
  });

  it('RF-202 a valid answer behind prose braces within the cap is found', () => {
    const lead = '{x} '.repeat(cardLimits.maxJsonCandidates - 3);

    expect(parseCardOutput(`${lead}${cardsJson()}`).ok).toBe(true);
  });

  it('RF-202 more prose brace groups than the cap are reported as capped', () => {
    const lead = '{x} '.repeat(cardLimits.maxJsonCandidates + 1);

    const messages = problemsOf(`${lead}${cardsJson()}`).map((problem) => problem.message);

    expect(messages.join(' ')).toMatch(/first/);
  });
});

describe('card line numbers are bounded like their string form', () => {
  it.each([
    ['endLine', { path: 'a.cs', startLine: 1, endLine: 9e15 }],
    ['startLine', { path: 'a.cs', startLine: 9e15, endLine: 9e15 }],
    ['a fractional line', { path: 'a.cs', startLine: 1, endLine: 2.5 }],
  ])('RF-202 a huge or fractional %s given as a number is rejected', (_name, citation) => {
    const claims = [{ text: 'x', citations: [citation] }];

    expect(problemsOf(cardsJson({ claims })).length).toBeGreaterThan(0);
  });

  it('RF-202 the largest accepted line number is the same as for text', () => {
    const number = { path: 'a.cs', startLine: 1, endLine: 999_999_999 };
    const text = { path: 'a.cs', startLine: '1', endLine: '999999999' };

    for (const citation of [number, text]) {
      const claims = [{ text: 'x', citations: [citation] }];
      expect(parseCardOutput(cardsJson({ claims })).ok).toBe(true);
    }
  });
});

describe('the area the agent writes', () => {
  it('RF-203 is required by the schema but the task area is the one a card gets', () => {
    const parsed = parseCardOutput(
      JSON.stringify({ cards: [cardObject({ area: 'agent-guess' })] }),
    );
    if (!parsed.ok) throw new Error('fixture');

    const cards = assignCardIds([{ agentTaskId: 't', area: 'billing', drafts: parsed.value }]);

    expect(cards.ok && cards.value[0]?.area).toBe('billing');
  });
});
