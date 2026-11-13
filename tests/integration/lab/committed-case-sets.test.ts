import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { heldBackIds } from '../../../src/application/lab/capture/held-back.js';
import { personalDataIn } from '../../../src/application/lab/capture/personal-data.js';
import { parseLabCaseSet, type LabCaseSet } from '../../../src/application/lab/lab-case-set.js';
import { sha256Hex } from '../../../src/infrastructure/lab/run-folder.js';
import { listLabTargets } from '../../../src/presentation/lab/lab-targets.js';

// RF-1405, DEC-57, DEC-231: the committed case sets are read by their targets, name their source and
// licence, keep a third back by the fixed rule, hold nothing personal and no model's answer as truth.
// Each check collects its problems, so one failure names every set and case at fault.

const labFolder = fileURLToPath(new URL('../../../lab/', import.meta.url));
const promptsFolder = fileURLToPath(new URL('../../../prompts/', import.meta.url));

/** The two samples are invented by hand; every other set is built by the capture. */
const SAMPLES = new Set(['overview-sample', 'verifier-claim-sample']);
const CAPTURED = [
  'cards-card-format',
  'planner-gap',
  'reader-answers',
  'reader-area',
  'reader-parent-cards',
  'reader-read-first',
  'reader-read-more',
  'reader-reread',
  'reader-task',
  'reader-turns-left',
  'summariser-merge',
  'summariser-overview',
];

interface Loaded {
  readonly name: string;
  readonly text: string;
  readonly set: LabCaseSet;
}

async function loadAll(): Promise<Loaded[]> {
  const files = (await readdir(join(labFolder, 'cases'))).filter((each) => each.endsWith('.json'));
  const loaded: Loaded[] = [];
  for (const file of files) {
    const text = await readFile(join(labFolder, 'cases', file), 'utf8');
    const set = parseLabCaseSet(JSON.parse(text));
    if (!set.ok) throw new Error(`${file}: ${set.error.join('; ')}`);
    loaded.push({ name: file.replace('.json', ''), text, set: set.value });
  }
  return loaded;
}

const captured = async (): Promise<Loaded[]> =>
  (await loadAll()).filter((each) => !SAMPLES.has(each.name));

function sourceProblems({ name, set }: Loaded): string[] {
  const keys = new Set((set.sources ?? []).map((source) => source.key));
  const problems = keys.size === 0 ? [`${name}: no sources`] : [];
  for (const source of set.sources ?? []) {
    if (source.licence === '' || source.runs.length === 0) problems.push(`${name}: ${source.key}`);
  }
  const lost = set.cases.filter((each) => !keys.has(each.from ?? ''));
  return [...problems, ...lost.map((each) => `${name}: ${each.id} has no source`)];
}

function splitProblems({ name, set }: Loaded): string[] {
  const ids = set.cases.map((each) => each.id);
  const held = set.cases.filter((each) => each.split === 'held-back').map((each) => each.id);
  const rule = heldBackIds(set.prompt, ids, sha256Hex);
  const wrong = held.length !== rule.size || held.some((id) => !rule.has(id));
  return [
    ...(wrong ? [`${name}: the held-back cases are not the ones the rule picks`] : []),
    ...(held.length * 3 < ids.length ? [`${name}: less than a third held back`] : []),
  ];
}

/** Only code of a known public licence is committed (DEC-03): eShopModernizing, MIT. */
const PUBLISHED_SOURCES = ['eshop'];

function publishedProblems({ name, set, text }: Loaded): string[] {
  const other = (set.sources ?? []).filter((source) => !PUBLISHED_SOURCES.includes(source.key));
  const named = /Asset Manager|Invoice Generator|asset-manager|invoice-generator/iu.test(text);
  return [
    ...other.map((source) => `${name}: source ${source.key} may not be published`),
    ...(named ? [`${name}: names a workbook that may not be published`] : []),
    ...(set.cases.length < 3 ? [`${name}: fewer than 3 cases`] : []),
  ];
}

describe('the committed case sets', () => {
  it('RF-1405 holds only published sources, and at least three cases per captured set', async () => {
    expect((await captured()).flatMap(publishedProblems)).toEqual([]);
  });

  it('RF-1405 has a captured set for each prompt the capture covers', async () => {
    const names = (await loadAll()).map((each) => each.name);

    expect(CAPTURED.filter((name) => !names.includes(name))).toEqual([]);
  });

  it('RF-1406 is read case by case by the target of its prompt', async () => {
    const targets = await listLabTargets(promptsFolder);
    const problems: string[] = [];

    for (const { name, set } of await loadAll()) {
      const target = targets.find((each) => each.id === set.prompt);
      if (target === undefined) problems.push(`${name}: no target`);
      for (const each of set.cases) {
        const parsed = target?.parseInput(each.input);
        if (parsed?.ok === false) problems.push(`${name} ${each.id}: ${parsed.error}`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('RF-1405 names a source with a licence for every case of a captured set', async () => {
    expect((await captured()).flatMap(sourceProblems)).toEqual([]);
  });

  it('RF-1405 holds back exactly the cases the fixed rule picks, at least a third', async () => {
    expect((await captured()).flatMap(splitProblems)).toEqual([]);
  });

  it('RF-1404 holds nothing personal and no expected label that a model wrote', async () => {
    const all = await loadAll();
    const personal = all.filter((each) => personalDataIn(each.text) !== undefined);
    const labelled = (await captured()).filter((each) =>
      each.set.cases.some((one) => one.expected !== undefined),
    );

    expect([personal, labelled].map((list) => list.map((each) => each.name))).toEqual([[], []]);
  });
});
