import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import type { SourceCard } from '../../../src/domain/planning/plan-sources.js';
import {
  answerText,
  catalogCards,
  invoiceCards,
  productSheetCards,
  siteSheetCards,
  runCards,
  stockCards,
} from '../../support/data-model-defect-cards.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';

// P7-13, RF-603, RF-623, RF-627, ADR-008: the data-model answers of the evaluation of 2026-10-29
// (Asset Manager and eShop with Haiku, Asset Manager and Invoice with Ollama, written again in new
// words, tests/fixtures/planner/) go through a plan run on SQL Server. The package has none of the
// tables or columns the card names, keeps integer columns as int with no "Left out" row for them,
// and gives movement_type room for "Opening Stock".

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');
let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-defects-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

/** The plan run's data-model.md and checks.md (backslash escapes removed) for this recorded answer. */
async function filesFor(answerName: string, cards: SourceCard[]) {
  const base = await loadRecording(recordingPath);
  const [first, second, third] = base.calls;
  const attempt = third?.attempts[0];
  if (first === undefined || second === undefined || attempt === undefined) throw new Error('x');
  if (!('response' in attempt)) throw new Error('The recording has three calls');
  const text = await answerText(answerName);
  const calls = [first, second, { attempts: [{ response: { ...attempt.response, text } }] }];
  const h = await createPlanHarness(dataDir, { ...base, calls }, {});
  const around = planCards().filter((each) => each.type === 'FEAT' || each.type === 'OQ');
  await h.understandRun({ cards: [...around, ...runCards(cards)], questions: planQuestions });
  await h.saveBrief({
    architecture: { style: 'hexagonal' },
    migration: 'parallel-change',
    stack: [{ layer: 'database', choice: 'SQL Server', custom: true }],
  });
  const files = await h.handoffOf(await h.plan());
  const plain = (name: string) => (files[name] ?? '').replaceAll(String.fromCharCode(92), '');
  return { model: plain('data-model.md'), checks: plain('checks.md') };
}

const tableNames = (model: string) => [...model.matchAll(/^### (\S+)$/gmu)].map((m) => m[1]);
const sectionOf = (checks: string, heading: string) =>
  checks.split(new RegExp(`^## ${heading}$`, 'mu'))[1]?.split(/^## /mu)[0] ?? '';

describe('BuildPlan: the Asset Manager answer (Haiku)', () => {
  it('EV-74 keeps integer columns as int and lists none of them as left out', async () => {
    const { model, checks } = await filesFor('data-model-asset-manager-haiku', stockCards());

    expect(model).not.toContain('integer');
    expect(model).toMatch(/\| quantity \| int \| yes \|/u);
    expect(sectionOf(checks, 'Left out')).not.toContain('quantity');
    expect(sectionOf(checks, 'Left out')).not.toContain('closing_stock');
    expect(checks).not.toContain('is not a SQL Server type');
  });

  it('EV-75 gives movement_type room for Opening Stock and says so in the Data model checks', async () => {
    const { model, checks } = await filesFor('data-model-asset-manager-haiku', stockCards());

    expect(model).toMatch(/\| movement_type \| varchar\(13\) \|/u);
    expect(model).not.toContain('varchar(3)');
    expect(sectionOf(checks, 'Data model')).toContain('`movement_type`');
  });
});

describe('BuildPlan: the Asset Manager answer (Ollama)', () => {
  it('EV-31 has neither metrics_to_derive_status nor valuation_lookup_range', async () => {
    const { model, checks } = await filesFor(
      'data-model-asset-manager-ollama',
      productSheetCards(),
    );

    expect(model).toContain('product_id');
    expect(model).not.toContain('metrics_to_derive_status');
    expect(model).not.toContain('valuation_lookup_range');
    expect(sectionOf(checks, 'Left out')).toContain('`metrics_to_derive_status`');
  });
});

describe('BuildPlan: the eShop answer', () => {
  it('EV-40 has one table for each of brand, type and item, and none for what stores nothing', async () => {
    const { model, checks } = await filesFor('data-model-eshop-duplicates', catalogCards());

    expect(tableNames(model)).toEqual(['catalog_brand', 'catalog_type', 'catalog_item']);
    expect(model).not.toMatch(/configuration|registration|viewmodel/u);
    const section = sectionOf(checks, 'Data model');
    for (const id of ['ENT-005', 'ENT-006', 'ENT-007', 'ENT-008']) expect(section).toContain(id);
    expect(section).toContain('catalog_brands');
  });

  it('EV-75 lists the description typed to confirm, which no claim types', async () => {
    const { model, checks } = await filesFor('data-model-eshop-duplicates', catalogCards());

    expect(model).toMatch(/\| description \| to confirm \|/u);
    expect(sectionOf(checks, 'Data model')).toContain('`description`');
  });
});

describe('BuildPlan: the Invoice answer', () => {
  it('EV-31 has no table for the workbook file or its glossary, and lists text as deprecated', async () => {
    const { model, checks } = await filesFor('data-model-invoice-junk', invoiceCards());

    expect(tableNames(model)).toEqual(['invoice']);
    const section = sectionOf(checks, 'Data model');
    expect(section).toContain('`status`');
    expect(section).toContain('varchar(max)');
    expect(sectionOf(checks, 'Left out')).not.toContain('status');
  });
});

describe('BuildPlan: per-site sheets', () => {
  it('RF-623 writes one table with a site column for three per-site sheets and lists the merge', async () => {
    const { model, checks } = await filesFor('data-model-site-sheets', siteSheetCards());

    expect(tableNames(model)).toEqual(['access_point', 'tag_list']);
    expect(model).toMatch(/\| site \|/u);
    const section = sectionOf(checks, 'Data model');
    for (const sheet of ['access_point_site_a', 'access_point_site_b', 'access_point_site_c']) {
      expect(section).toContain(sheet);
    }
    expect(section).toContain('site');
  });

  it('RF-623 writes no table for a sheet the PRD out-of-scope section cites', async () => {
    const { model } = await filesFor('data-model-site-sheets', siteSheetCards());

    expect(model).not.toContain('refund_log');
  });

  it('RF-623 keeps the table with other columns apart', async () => {
    const { model } = await filesFor('data-model-site-sheets', siteSheetCards());

    expect(model).toContain('colour');
    expect(model).not.toMatch(/tag_list[\s\S]*\| site \|[\s\S]*access_point/u);
  });
});
