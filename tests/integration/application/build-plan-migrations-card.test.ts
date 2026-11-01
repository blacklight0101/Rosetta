import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadRecording,
  type Recording,
} from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { customerCard, planCards, planQuestions } from '../../support/plan-cards.js';

// P7-20, EV-81, RF-610, RF-623, RF-630, DEC-190: the data-access card never depends on a migrations
// card that is not there. Synthetic fake-provider recordings shaped like the eShop plan: five
// tables and a planner card that creates the schema; no provider was called.

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');
const migrationsTitle = 'Write the database migrations in the chosen stack';
const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
} as const;

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-migrations-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

/** The recording with its plan's first card standing in for the migrations, and its tables replaced. */
async function shopRecording(): Promise<Recording> {
  const base = await loadRecording(recordingPath);
  const model = await readFile('tests/fixtures/planner/data-model-shop-five-tables.json', 'utf8');
  const calls = base.calls.map((call, index) => {
    const attempt = call.attempts[0];
    if (attempt === undefined || !('response' in attempt)) return call;
    if (index === 0) {
      const text = attempt.response.text.replace(
        '"title": "Order placement"',
        '"title": "Create the catalogue schema and seed it on first run"',
      );
      return { attempts: [{ response: { ...attempt.response, text } }] };
    }
    if (index === 2) return { attempts: [{ response: { ...attempt.response, text: model } }] };
    return call;
  });
  return { ...base, calls };
}

async function tasksOf(h: PlanHarness): Promise<string> {
  const run = await h.plan();
  expect(run.endState).toBe('Completed');
  return (await h.handoffOf(run))['tasks.md'] ?? '';
}

interface Card {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly depends: string[];
}

/** Each card of tasks.md: its id, its bold title and the ids on its "Depends on" line. */
function cardsOf(text: string): Card[] {
  return text
    .split(/^(?=## T-\d+)/gmu)
    .filter((part) => part.startsWith('## T-'))
    .map((body) => ({
      id: /^## (T-\d+)/u.exec(body)?.[1] ?? '',
      title: /^\*\*(.+)\*\*$/mu.exec(body)?.[1] ?? '',
      body,
      depends: [...(/^Depends on:.*$/mu.exec(body)?.[0].matchAll(/\[(T-\d+)\]/gu) ?? [])].map(
        (each) => each[1] ?? '',
      ),
    }));
}

function expectResolved(cards: readonly Card[]): void {
  const known = new Set(cards.map((card) => card.id));
  for (const card of cards) for (const on of card.depends) expect(known.has(on)).toBe(true);
}

describe('BuildPlan: the fixed data-access card (P7-20)', () => {
  it('RF-610 EV-81 five tables and a planner schema card give a migrations card the data access waits for', async () => {
    const h = await createPlanHarness(dataDir, await shopRecording());
    await h.understandRun({ cards: [...planCards(), customerCard()], questions: planQuestions });
    await h.saveBrief(briefAnswers);

    const cards = cardsOf(await tasksOf(h));

    const migrations = cards.find((card) => card.title.includes(migrationsTitle));
    const access = cards.find((card) => card.title.includes('data-access'));
    expect(cards.some((card) => card.title.includes('Create the catalogue schema'))).toBe(true);
    expect(migrations).toBeDefined();
    expect(access?.depends).toContain(migrations?.id);
    expect(access?.body).toContain('tables of the migrations card');
    expectResolved(cards);
  });

  it('DEC-190 a recording with no entity has no data card and no dangling dependency', async () => {
    const h = await createPlanHarness(dataDir, await loadRecording(recordingPath));
    await h.understandRun({
      cards: planCards().filter((card) => card.type !== 'ENT'),
      questions: planQuestions,
    });
    await h.saveBrief(briefAnswers);

    const cards = cardsOf(await tasksOf(h));

    expect(cards.some((card) => card.title.includes('data-access'))).toBe(false);
    expect(cards.some((card) => card.title.includes(migrationsTitle))).toBe(false);
    expectResolved(cards);
  });

  it('P7-20 the recorded data model plan keeps its migrations first and its data access after it', async () => {
    const h = await createPlanHarness(dataDir, await loadRecording(recordingPath));
    await h.understandRun({ cards: [...planCards(), customerCard()], questions: planQuestions });
    await h.saveBrief(briefAnswers);

    const cards = cardsOf(await tasksOf(h));

    expect(cards[1]?.title).toContain(migrationsTitle);
    expect(cards[2]?.title).toContain('data-access');
    expect(cards[2]?.depends).toContain('T-002');
  });
});
