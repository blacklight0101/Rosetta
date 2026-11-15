import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LabTarget } from '../../../../../src/application/lab/lab-target.js';
import { cardsRepairTarget } from '../../../../../src/application/lab/targets/cards-repair-target.js';
import { loadReaderPrompts } from '../../../../../src/infrastructure/prompts/prompt-files.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';

// RF-1406, RF-208 (P10-07): a card repair answer is merged into the readable cards of the earlier
// answer with the run's own `mergeDrafts`. `Fixed`: every card the earlier answer wrote is there with
// at least as many claims as it wrote; `Dropped`: the run keeps a card without the claim the repair
// was asked to fix. `Partial` and `Unusable` record the follow-up `second repair`.

const promptsFolder = fileURLToPath(new URL('../../../../../prompts/', import.meta.url));

const claim = (text: string, citation: string) => ({ text, citations: [citation] });
const card = (title: string, claims: unknown[]) => ({
  ...{ type: 'FEAT', title, area: 'shop', summary: `${title}.`, confidence: 'High' },
  claims,
});
const lists = claim('It lists the orders.', 'shop/Orders.cs:10-11');
const pages = claim('It shows ten orders a page.', 'shop/Orders.cs:12-12');
const badPages = claim('It shows ten orders a page.', 'class Orders {');
const totals = claim('It sums the order lines.', 'shop/Orders.cs:20-21');
const answerOf = (...cards: unknown[]) => JSON.stringify({ cards });

const earlier = answerOf(card('List orders', [lists, badPages]), card('Order totals', [totals]));
const input = {
  area: 'shop',
  files: [{ path: 'shop/Orders.cs', language: 'csharp', lines: 120 }],
  turns: 6,
  reads: [{ path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] }],
  answer: earlier,
};

let target: LabTarget;

beforeAll(async () => {
  target = cardsRepairTarget(await loadReaderPrompts(promptsFolder));
});

async function read(text: string) {
  const parsed = target.parseInput(input);
  if (!parsed.ok) throw new Error(parsed.error);
  const { env } = environment([{ text }]);
  return parsed.value.run(env, draftFile('cards/repair.v9.md', 'Fix:\n{{problems}}\n'));
}

describe('the card repair check of the lab: the merged answer', () => {
  it('RF-1406 reads a repair that writes the faulty card again whole as Fixed', async () => {
    const whole = answerOf(card('List orders', [lists, pages]), card('Order totals', [totals]));
    const onlyFaulty = answerOf(card('List orders', [lists, pages]));

    expect(await read(whole)).toEqual({
      ...{ usable: true, detail: 'Fixed' },
      followUps: { 'second repair': false },
    });
    expect((await read(onlyFaulty)).detail).toBe('Fixed');
  });

  it('RF-1406 reads a repair that leaves out the claim it was asked to fix as Dropped', async () => {
    const withoutFix = answerOf(card('List orders', [lists]), card('Order totals', [totals]));
    const otherCard = answerOf(card('Order totals', [totals]));

    expect(await read(withoutFix)).toEqual({
      ...{ usable: false, detail: 'Dropped' },
      followUps: { 'second repair': false },
    });
    expect((await read(otherCard)).detail).toBe('Dropped');
  });

  it('RF-1406 records the second repair a run sends after a Partial or Unusable answer', async () => {
    const partial = answerOf(card('List orders', [lists, badPages]));

    expect((await read(partial)).followUps).toEqual({ 'second repair': true });
    expect(await read('No cards.')).toEqual({
      ...{ usable: false, detail: 'Unusable' },
      followUps: { 'second repair': true },
    });
  });
});

describe('the card repair check of the lab: an earlier answer that cannot be read', () => {
  const prose = 'The page lists the orders and sums their lines; I have read both files.';
  const twoFiles = {
    ...input,
    reads: [
      { path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] },
      { path: 'shop/Totals.cs', startLine: 20, lines: ['class Totals {', '}'] },
    ],
    answer: prose,
  };
  const totalsClaim = claim('It sums the order lines.', 'shop/Totals.cs:20-21');

  async function readProse(text: string) {
    const parsed = target.parseInput(twoFiles);
    if (!parsed.ok) throw new Error(parsed.error);
    const { env } = environment([{ text }]);
    return parsed.value.run(env, draftFile('cards/repair.v9.md', 'Fix:\n{{problems}}\n'));
  }

  it('RF-1406 reads a repair that leaves a file read with no card as Uncovered', async () => {
    const one = answerOf(card('List orders', [lists]));
    const both = answerOf(card('List orders', [lists]), card('Order totals', [totalsClaim]));

    expect(await readProse(one)).toEqual({
      ...{ usable: false, detail: 'Uncovered' },
      followUps: { 'second repair': false },
    });
    expect((await readProse(both)).detail).toBe('Fixed');
  });

  it('RF-1406 records a second repair after a repair turn that asks to read more', async () => {
    const parsed = target.parseInput(input);
    if (!parsed.ok) throw new Error(parsed.error);
    const readCall = { id: 'c1', name: 'read_file', arguments: { path: 'shop/Orders.cs' } };
    const { env } = environment([{ text: '', toolCalls: [readCall] }]);

    const outcome = await parsed.value.run(
      env,
      draftFile('cards/repair.v9.md', 'Fix:\n{{problems}}\n'),
    );

    expect(outcome).toEqual({
      ...{ usable: false, detail: 'ReadsMore' },
      followUps: { 'second repair': true },
    });
  });
});
