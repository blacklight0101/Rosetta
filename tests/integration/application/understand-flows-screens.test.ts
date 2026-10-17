import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Card } from '../../../src/domain/cards/card.js';
import { parseTaskResults } from '../../../src/infrastructure/cards/task-results-schema.js';
import { loadReaderPrompts } from '../../../src/infrastructure/prompts/prompt-files.js';
import { UNDERSTAND_TIMEOUT, readJson } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-260, RF-261, RF-263, Q-25, DEC-134, ADR-008: a recorded understand run over the WebForms shop
// fixture (a catalogue and an order journey over four pages and a service library). The agent
// writes FLOW cards where the code map finds entry points and SCRN cards where it finds pages,
// each step cited; a suspected path is an OQ card; the library area gets neither the prompt
// fragments nor any card, and its coverage says so.

interface ShopRun {
  readonly h: Awaited<ReturnType<typeof createUnderstandHarness>>;
  readonly run: Awaited<
    ReturnType<Awaited<ReturnType<typeof createUnderstandHarness>>['understand']>
  >;
  readonly folder: string;
  readonly cards: readonly Card[];
}

// One run for the whole file: every test reads it and none changes it.
const state: { dir?: string; shop?: ShopRun } = {};

beforeAll(async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-flows-screens-')));
  state.dir = dir;
  const h = await createUnderstandHarness({
    dataDir: dir,
    recording: 'understand-flows-screens.json',
    fixture: 'webforms-shop',
  });
  await h.scan();
  const run = await h.understand();
  const folder = h.runFolder(run);
  const stored = parseTaskResults(await readJson(join(folder, 'task-results.json')));
  state.shop = { h, run, folder, cards: (stored ?? []).flatMap((task) => task.cards) };
}, UNDERSTAND_TIMEOUT.timeout);

afterAll(async () => {
  if (state.dir !== undefined) {
    await rm(state.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function shopRun(): ShopRun {
  if (state.shop === undefined) throw new Error('The shop run is not ready');
  return state.shop;
}

const byTitle = (cards: readonly Card[], title: string): Card | undefined =>
  cards.find((card) => card.title === title);

describe('an understand run over the WebForms shop: cards', () => {
  it('RF-260 writes FLOW cards for the catalogue and the order journeys, every step cited', () => {
    const { run, cards } = shopRun();

    expect(run.endState).toBe('Completed');
    const flows = cards.filter((card) => card.type === 'FLOW');
    expect(flows.map((card) => card.title)).toEqual([
      'Browse the catalogue',
      'Add an item to the basket',
      'Place an order',
    ]);
    expect(flows.map((card) => card.id)).toEqual(['FLOW-001', 'FLOW-002', 'FLOW-003']);
    for (const flow of flows) {
      expect(flow.claims.length).toBeGreaterThan(1);
      expect(flow.claims.every((step) => step.citations.length > 0)).toBe(true);
      expect(flow.claims.every((step) => step.status === 'Proposed')).toBe(true);
      expect(flow.flow?.trigger).not.toBe('');
    }
  });

  it('RF-260 an alternative path of a step is a numbered, cited branch of that step', () => {
    const { cards } = shopRun();

    const order = byTitle(cards, 'Place an order');

    const branches = order?.claims[0]?.branches ?? [];
    expect(branches).toHaveLength(1);
    expect(branches[0]?.number).toBe(1);
    expect(branches[0]?.citations).toEqual([
      { path: 'Orders/Checkout.aspx', startLine: 6, endLine: 7 },
    ]);
  });
});

describe('an understand run over the WebForms shop: screens and questions', () => {
  it('RF-261 writes SCRN cards for the pages of both journeys with fields, validations and actions', () => {
    const { cards } = shopRun();

    const screens = cards.filter((card) => card.type === 'SCRN');
    expect(screens.map((card) => card.screen?.route)).toEqual([
      '/Default.aspx',
      '/Catalog/Details.aspx',
      '/Orders/Checkout.aspx',
      '/Orders/Confirm.aspx',
    ]);
    const checkout = byTitle(cards, 'Checkout')?.screen;
    const email = checkout?.fields.find((field) => field.name === 'EmailBox');
    expect(email?.required).toBe(true);
    expect(email?.validations.map((validation) => validation.citations[0]?.startLine)).toEqual([
      6, 7,
    ]);
    expect(checkout?.actions).toEqual([{ label: 'Place order', handler: 'PlaceButton_Click' }]);
    expect(checkout?.leadsTo).toEqual(['/Orders/Confirm.aspx', '/Default.aspx']);
  });

  it('RF-260 a path the agent only suspects is an OQ card and not a step of the flow', () => {
    const { cards } = shopRun();

    const question = cards.find((card) => card.type === 'OQ');
    expect(question?.title).toBe('Order with an empty basket');
    const order = byTitle(cards, 'Place an order');
    expect(order?.claims.map((step) => step.text).join(' ')).not.toContain('empty basket');
  });

  it('Q-25 the service library area writes neither a FLOW nor a SCRN card', () => {
    const { cards } = shopRun();

    const library = cards.filter((card) => card.area === 'Services');
    expect(library.map((card) => card.type)).toEqual(['BR']);
  });
});

describe('an understand run over the WebForms shop: prompts', () => {
  it('Q-25 the fragments reach the areas with entry points or pages and not the library', async () => {
    const { h } = shopRun();
    const { surface } = await loadReaderPrompts('prompts');
    const flows = surface?.flows.text.trim() ?? '';
    const screens = surface?.screens.text.trim() ?? '';

    const systemOf = (agentTaskId: string): string =>
      h.providers.requests().find((request) => request.context.agentTaskId === agentTaskId)
        ?.system ?? '';

    expect(flows.length).toBeGreaterThan(0);
    for (const task of ['reader-001', 'reader-002', 'reader-003']) {
      expect(systemOf(task)).toContain(flows);
      expect(systemOf(task)).toContain(screens);
    }
    expect(systemOf('reader-004')).not.toContain(flows);
    expect(systemOf('reader-004')).not.toContain(screens);
    expect(systemOf('reader-004')).toContain('Final answer: cards');
  });

  it('RNF-004 the manifest records the two fragments the run used', async () => {
    const { h, run } = shopRun();

    const manifest = await h.manifestOf(run);

    expect(manifest.promptVersions['cards/flows.v1.md']?.version).toBe('v1');
    expect(manifest.promptVersions['cards/screens.v1.md']?.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe('an understand run over the WebForms shop: coverage', () => {
  it('RF-263 coverage.json counts the flow and screen cards of each area and what the code map marked', async () => {
    const { folder } = shopRun();

    const coverage = await readJson(join(folder, 'coverage.json'));

    expect(coverage).toMatchObject({
      areas: [
        {
          area: '(root)',
          surface: { flowsMarked: true, screensMarked: true, flowCards: 1, screenCards: 1 },
        },
        {
          area: 'Catalog',
          surface: { flowsMarked: true, screensMarked: true, flowCards: 1, screenCards: 1 },
        },
        {
          area: 'Orders',
          surface: { flowsMarked: true, screensMarked: true, flowCards: 1, screenCards: 2 },
        },
        {
          area: 'Services',
          surface: { flowsMarked: false, screensMarked: false, flowCards: 0, screenCards: 0 },
        },
      ],
    });
  });

  it('RF-261 coverage.md says "no flows found; no screens found" for the library area only', async () => {
    const { folder } = shopRun();

    const markdown = await readFile(join(folder, 'coverage.md'), 'utf8');

    expect(markdown).toContain('- Services: no flows found; no screens found');
    expect(markdown).toContain('- Orders: 1 flow card; 2 screen cards');
    expect(markdown.match(/no screens found/gu)).toHaveLength(1);
  });
});
