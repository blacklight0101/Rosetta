import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  copiedExamples,
  exampleSentencesOf,
  exampleSentencesOfAll,
  normaliseSentence,
} from '../../../../src/domain/planning/copied-example.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import { emptyPrd, type PrdContent } from '../../../../src/domain/planning/prd-content.js';

// P3-117, EV-34: the example sentences of the planner prompts and the sentences of a package that
// repeat them.

const folder = join('prompts', 'planner');
const plan = assemblePlan(
  {
    summary: 'A web application.',
    requirements: [],
    components: [],
    decisions: [],
    entities: [],
    phases: [],
    tasks: [],
    risks: [],
    technical: { integrations: [], security: [], targets: [], environments: [] },
  },
  new Set(),
).content;

async function promptTexts(pattern: RegExp): Promise<string[]> {
  const names = (await readdir(folder)).filter((name) => pattern.test(name));
  return Promise.all(names.map((name) => readFile(join(folder, name), 'utf8')));
}

const statement = (text: string): { text: string; sources: string[] } => ({
  text,
  sources: ['BR-001'],
});

describe('P3-117 the example sentences of a prompt', () => {
  it('P3-117 are the full-stop texts of its fenced JSON, not titles, ids or paths', () => {
    const prompt = [
      'Prose with "A quoted sentence." outside the block.',
      '```json',
      '{ "title": "Place an order", "id": "FEAT-001", "files": ["src/a/"],',
      '  "text": "First sentence. Second one here.", "short": "Done." }',
      '```',
    ].join('\n');

    expect([...exampleSentencesOf(prompt)].sort()).toEqual(['first sentence', 'second one here']);
  });

  it('P3-117 older prompt versions give the sentences models learned: refunds and card numbers', async () => {
    const examples = exampleSentencesOfAll(await promptTexts(/^(prd|package)\.v[12]\.md$/u));

    expect(examples.has('automatic refunds')).toBe(true);
    expect(examples.has('card numbers are never stored')).toBe(true);
    expect(examples.has('orders over 50 ship free')).toBe(true);
  });

  it('P3-117 the sentences are compared without case, punctuation and extra spaces', () => {
    expect(normaliseSentence('  Card   numbers, are NEVER stored! ')).toBe(
      'card numbers are never stored',
    );
  });
});

describe('P3-117 the new planner prompts', () => {
  const current = /^(prd\.v3|package\.v7)\.md$/u;

  it('P3-117 mark the example as form only and hold no example sentence at all', async () => {
    for (const text of await promptTexts(current)) {
      expect(text.replaceAll(/\s+/gu, ' ')).toContain(
        'shows the form of the answer only, never its content',
      );
      expect(exampleSentencesOf(text).size).toBe(0);
    }
  });

  it('P3-117 hold no shop or payment example text', async () => {
    const shop =
      /\b(shop|basket|shipping|ships?|refunds?|checkout|payment|customers?|card numbers?)\b/iu;
    for (const text of await promptTexts(current)) {
      expect(shop.exec(text)?.[0]).toBeUndefined();
    }
  });

  it('P3-117 write every example text of the answer as a placeholder in angle brackets', async () => {
    for (const text of await promptTexts(current)) {
      const block = /```json\n([\s\S]*?)```/u.exec(text)?.[1] ?? '';
      const words = [...block.matchAll(/"([^"]*[a-z ][^"]*)"/giu)]
        .map((each) => each[1] ?? '')
        .filter((each) => !/^[a-z]+$/u.test(each) || each.length > 20);
      expect(words.filter((word) => !word.includes('<') && !/^[A-Za-z]+$/u.test(word))).toEqual([]);
    }
  });

  it('P3-117 are new versions: the older ones stay for replays', async () => {
    const names = await readdir(folder);

    expect(names).toEqual(expect.arrayContaining(['prd.v1.md', 'prd.v2.md', 'prd.v3.md']));
    expect(names).toEqual(expect.arrayContaining(['package.v6.md', 'package.v7.md']));
  });
});

describe('P3-117 the sentences of a package that copy an example', () => {
  const examples = new Set(['automatic refunds', 'card numbers are never stored']);

  it('P3-117 flags a copied sentence in the PRD and in the plan, once, whatever its spelling', () => {
    const prd: PrdContent = {
      ...emptyPrd,
      outOfScope: [statement('AUTOMATIC refunds.'), statement('Something else entirely.')],
      nonFunctional: [statement('Nothing is wrong. Card numbers are never stored!')],
    };
    const withRisk = {
      ...plan,
      risks: [{ id: 'RISK-001', text: 'Card numbers are never stored.', sources: [] }],
    };

    const found = copiedExamples({ prd, plan: withRisk }, examples);

    expect(found).toEqual([
      { where: 'PRD, out of scope', sentence: 'AUTOMATIC refunds.' },
      { where: 'PRD, non-functional', sentence: 'Card numbers are never stored!' },
      { where: 'Plan, risks', sentence: 'Card numbers are never stored.' },
    ]);
  });

  it('P3-117 flags nothing when no sentence matches or the prompts have no example', () => {
    const prd: PrdContent = { ...emptyPrd, outOfScope: [statement('Automatic refunds later.')] };

    expect(copiedExamples({ prd, plan }, examples)).toEqual([]);
    expect(
      copiedExamples(
        { prd: { ...emptyPrd, outOfScope: [statement('Automatic refunds.')] }, plan },
        new Set(),
      ),
    ).toEqual([]);
  });
});
