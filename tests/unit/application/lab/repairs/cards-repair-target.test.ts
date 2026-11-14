import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ReaderPrompts } from '../../../../../src/application/agent/reader-prompts.js';
import { parseCardsLenient } from '../../../../../src/application/cards/parse-cards.js';
import { renderRepairRequest } from '../../../../../src/application/cards/repair-request.js';
import type { LabTarget } from '../../../../../src/application/lab/lab-target.js';
import { cardsRepairTarget } from '../../../../../src/application/lab/targets/cards-repair-target.js';
import { loadReaderPrompts } from '../../../../../src/infrastructure/prompts/prompt-files.js';
import { draftFile, environment, type Answer } from '../../../../support/lab-target-env.js';

// RF-1406, RF-208, ADR-029: the target of the reader's repair request replays the reads of the case,
// then the fixed earlier answer of the case, then the repair request the run builds from the problems
// the run's card parser finds in that answer; the next answer is read by the card parser.

const promptsFolder = fileURLToPath(new URL('../../../../../prompts/', import.meta.url));

const cardOf = (citation: string) =>
  JSON.stringify({
    cards: [
      {
        ...{ type: 'FEAT', title: 'List orders', area: 'shop', summary: 'Lists the orders.' },
        confidence: 'High',
        claims: [{ text: 'It lists the orders.', citations: [citation] }],
      },
    ],
  });
const faulty = cardOf('class Orders {');
const valid = cardOf('shop/Orders.cs:10-11');

const input = {
  area: 'shop',
  files: [{ path: 'shop/Orders.cs', language: 'csharp', lines: 120 }],
  turns: 6,
  reads: [{ path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] }],
  answer: faulty,
};

let prompts: ReaderPrompts;
let target: LabTarget;

beforeAll(async () => {
  prompts = await loadReaderPrompts(promptsFolder);
  target = cardsRepairTarget(prompts);
});

async function run(answer: Answer, text = 'Fix these:\n{{problems}}\nNothing else.\n') {
  const parsed = target.parseInput(input);
  if (!parsed.ok) throw new Error(parsed.error);
  const { env, requests } = environment([answer]);
  const outcome = await parsed.value.run(env, draftFile('cards/repair.v9.md', text));
  return { outcome, requests };
}

describe('the card repair target', () => {
  it('RF-1406 sends the replay, the earlier answer and the repair request the run builds', async () => {
    const { requests } = await run({ text: valid });

    const messages = requests[0]?.messages ?? [];
    const problems = parseCardsLenient(faulty, new Map(), { suggestedAnswers: 'required' });
    expect(problems.problems.length).toBeGreaterThan(0);
    expect(messages.map((each) => each.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
      'assistant',
      'user',
    ]);
    expect(messages[4]?.content).toBe(faulty);
    expect(messages[5]?.content).toBe(
      renderRepairRequest('Fix these:\n{{problems}}\nNothing else.\n', problems.problems).trimEnd(),
    );
    expect(requests[0]?.system).toContain(prompts.cardFormat.text.slice(0, 40));
    expect(requests[0]?.tools.map((tool) => tool.name)).toContain('read_file');
    expect(requests[0]?.context.role).toBe('reader');
  });

  it('RF-1406 reads the next answer with the card parser', async () => {
    const readCall = { id: 'c1', name: 'read_file', arguments: { path: 'shop/Orders.cs' } };

    expect((await run({ text: valid })).outcome).toMatchObject({ usable: true, detail: 'Fixed' });
    expect((await run({ text: 'No cards.' })).outcome.detail).toBe('Unusable');
    expect((await run({ text: '', toolCalls: [readCall] })).outcome.detail).toBe('ReadsMore');
    expect(target.readsAnswer(valid)).toBe(true);
    expect(target.readsAnswer(faulty)).toBe(false);
  });

  it('RF-1406 makes no call for a draft without its one placeholder', async () => {
    const { outcome, requests } = await run({ text: valid }, 'Fix the cards.');

    expect(outcome).toEqual({ usable: false, detail: 'BadPrompt' });
    expect(requests).toHaveLength(0);
  });

  it('RF-1401 refuses a case without reads, with an answer that has no problem, or a stray key', () => {
    expect(target.parseInput({ ...input, reads: [] }).ok).toBe(false);
    expect(target.parseInput({ ...input, answer: valid }).ok).toBe(false);
    expect(target.parseInput({ ...input, stray: 1 }).ok).toBe(false);
    expect(target.parseInput(input).ok).toBe(true);
  });
});
