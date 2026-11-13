import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inputKey, splitsOf } from '../../../src/application/lab/capture/held-back.js';
import { personalDataIn } from '../../../src/application/lab/capture/personal-data.js';
import { parseLabCaseSet, type LabCaseSet } from '../../../src/application/lab/lab-case-set.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { sha256Hex } from '../../../src/infrastructure/lab/run-folder.js';
import { listLabTargets } from '../../../src/presentation/lab/lab-targets.js';

// RF-1405, DEC-57, DEC-231, ADR-029: the committed case sets are read by their targets, name their
// source and licence, split by the fixed rule on the input (one input, one side in every set), hold
// no input twice, nothing personal, no secret the run's masker finds and no model's answer as truth.
// Each check collects its problems, so one failure names every set and case at fault.

const labFolder = fileURLToPath(new URL('../../../lab/', import.meta.url));
const promptsFolder = fileURLToPath(new URL('../../../prompts/', import.meta.url));

/**
 * The two samples are invented by hand; every other set is built by the capture, or for a repair
 * prompt on a captured set, and is checked like one (repair-case-sets.test.ts).
 */
const SAMPLES = new Set(['overview-sample', 'verifier-claim-sample']);
/** The repair sets take the side of their base case (repair-case-sets.test.ts), not the rule. */
const REPAIRS = new Set(['planner-gap-repair', 'planner-plan-repair', 'cards-repair']);
/** What a repair case adds to the input of its base case. */
const REPAIR_KEYS = new Set(['problems', 'answer']);
/**
 * The sets whose few inputs all fall on the tune side of the rule: no version of their prompt can be
 * kept on them until more runs are captured (runbook section 4). A change to this list is a change
 * to what the lab can decide, so it is stated here.
 */
const ONE_SIDED = ['planner-api-contract', 'planner-package', 'planner-plan-repair', 'planner-prd'];
const CAPTURED = [
  'cards-card-format',
  'cards-continue',
  'cards-flows',
  'cards-screens',
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
  const rule = splitsOf(
    set.cases.map((each) => each.input),
    sha256Hex,
  );
  const wrong = set.cases.filter((each, index) => each.split !== rule[index]);
  return wrong.map((each) => `${name}: ${each.id} is not on the side the rule picks`);
}

/** The input of a case as the rule reads it: a repair case is read as its base case. */
function baseInput(name: string, input: unknown): unknown {
  if (!REPAIRS.has(name) || input === null || typeof input !== 'object') return input;
  return Object.fromEntries(Object.entries(input).filter(([key]) => !REPAIR_KEYS.has(key)));
}

/** Every input held on both sides across the sets, with the sets and cases that disagree. */
function crossSetProblems(all: readonly Loaded[]): string[] {
  const seen = new Map<string, { side: string; where: string }>();
  const problems: string[] = [];
  for (const { name, set } of all) {
    for (const each of set.cases) {
      const key = inputKey(baseInput(name, each.input), sha256Hex);
      const first = seen.get(key);
      if (first === undefined) seen.set(key, { side: each.split, where: `${name} ${each.id}` });
      else if (first.side !== each.split) {
        problems.push(`${name} ${each.id} (${each.split}) and ${first.where} (${first.side})`);
      }
    }
  }
  return problems;
}

const oneSided = ({ set }: Loaded): boolean =>
  new Set(set.cases.map((each) => each.split)).size < 2;

/** An input that two cases of one set hold: a twin is measured twice and may cross the split. */
function repeatProblems({ name, set }: Loaded): string[] {
  const seen = new Map<string, string>();
  const problems: string[] = [];
  for (const each of set.cases) {
    const key = inputKey(each.input, sha256Hex);
    const first = seen.get(key);
    if (first === undefined) seen.set(key, each.id);
    else problems.push(`${name}: ${each.id} repeats the input of ${first}`);
  }
  return problems;
}

const masker = new SecretMasker();

/** Every text of every case input, as the run's masker would see it before sending. */
function textsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textsOf);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(textsOf);
  return [];
}

function secretProblems({ name, set }: Loaded): string[] {
  return set.cases.flatMap((each) =>
    textsOf(each.input)
      .filter((text) => masker.mask(text).text !== text)
      .map((text) => `${name}: ${each.id} holds a secret near ${text.slice(0, 40)}`),
  );
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
});

describe('the split and the texts of the committed case sets', () => {
  it('RF-1405 holds back exactly the cases the fixed rule picks', async () => {
    const ruled = (await captured()).filter((each) => !REPAIRS.has(each.name));

    expect(ruled.flatMap(splitProblems)).toEqual([]);
  });

  it('RF-1405 puts one canonical input on the same side in every committed set', async () => {
    expect(crossSetProblems(await captured())).toEqual([]);
  });

  it('RF-1405 has both sides in every captured set but the ones stated as one-sided', async () => {
    const found = (await captured()).filter(oneSided).map((each) => each.name);

    expect(found.sort()).toEqual(ONE_SIDED);
  });

  it('RF-1405 holds no input twice in a set, so no input is on both sides', async () => {
    expect((await loadAll()).flatMap(repeatProblems)).toEqual([]);
  });

  it('RF-1404 holds no secret that the run masker would mask', async () => {
    expect((await loadAll()).flatMap(secretProblems)).toEqual([]);
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
