import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inputKey, splitsOf } from '../../../src/application/lab/capture/held-back.js';
import { parseLabCaseSet, type LabCaseSet } from '../../../src/application/lab/lab-case-set.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { sha256Hex } from '../../../src/infrastructure/lab/run-folder.js';
import { listLabTargets } from '../../../src/presentation/lab/lab-targets.js';

// RF-1405, RF-1406, DEC-57, ADR-029, P10-10: the two sets of the shared prompts are built by hand
// from invented material (no source, no licence). Their cases keep the rule of the split, hold no
// input twice, name a label, and the masked-value cases hold only invented values that the run's
// masker finds, written as the token `{secret}` so no value stands in the file.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const promptsFolder = join(root, 'prompts');
const SETS: readonly [string, string][] = [
  ['shared-masked-value', 'shared/masked-value'],
  ['shared-text-tool-protocol', 'shared/text-tool-protocol'],
];

async function load(name: string): Promise<{ set: LabCaseSet; text: string }> {
  const text = await readFile(join(root, 'lab', 'cases', `${name}.json`), 'utf8');
  const set = parseLabCaseSet(JSON.parse(text));
  if (!set.ok) throw new Error(`${name}: ${set.error.join('; ')}`);
  return { set: set.value, text };
}

interface MaskedInput {
  readonly secret: string;
  readonly reads: readonly { readonly lines: readonly string[] }[];
}

const linesOf = (input: unknown): string[] =>
  (input as MaskedInput).reads.flatMap((read) => [...read.lines]);

describe('the shared case sets', () => {
  it.each(SETS)(
    'RF-1405 has %s for %s, with eight cases, a label each and no source',
    async (name, prompt) => {
      const { set } = await load(name);

      expect(set.prompt).toBe(prompt);
      expect(set.cases.length).toBeGreaterThanOrEqual(8);
      expect(set.cases.every((each) => each.expected !== undefined)).toBe(true);
      expect(set.sources ?? []).toEqual([]);
    },
  );

  it.each(SETS)(
    'RF-1405 splits %s by the rule on the input, at least a third held back',
    async (name) => {
      const { set } = await load(name);
      const rule = splitsOf(
        set.cases.map((each) => each.input),
        sha256Hex,
      );

      const wrong = set.cases.filter((each, index) => each.split !== rule[index]);

      expect(wrong.map((each) => each.id)).toEqual([]);
      const held = set.cases.filter((each) => each.split === 'held-back').length;
      expect(held * 3).toBeGreaterThanOrEqual(set.cases.length);
      expect(held).toBeLessThan(set.cases.length);
    },
  );

  it.each(SETS)('RF-1405 holds no input twice in %s', async (name) => {
    const { set } = await load(name);
    const keys = set.cases.map((each) => inputKey(each.input, sha256Hex));

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the shared case sets, read by their targets', () => {
  it.each(SETS)(
    'RF-1406 reads every case of %s with the target of its prompt',
    async (name, prompt) => {
      const { set } = await load(name);
      const target = (await listLabTargets(promptsFolder)).find((each) => each.id === prompt);

      const problems = set.cases.flatMap((each) => {
        const parsed = target?.parseInput(each.input);
        return parsed?.ok === true ? [] : [each.id];
      });

      expect(problems).toEqual([]);
    },
  );
});

describe('the shared case sets, per prompt', () => {
  it('RF-1405 keeps both sets apart: one set per prompt id', () => {
    expect(new Set(SETS.map(([, prompt]) => prompt)).size).toBe(SETS.length);
  });
});

describe('the masked-value set', () => {
  it('RF-1404 holds invented values only, no real key shape and no key block', async () => {
    const { set, text } = await load('shared-masked-value');

    expect(text).not.toMatch(/\bsk-|ghp_|github_pat_|AKIA|ASIA[0-9A-Z]|BEGIN [A-Z ]*PRIVATE KEY/u);
    const secrets = set.cases.map((each) => (each.input as MaskedInput).secret);
    expect(secrets.every((secret) => /^FakeSecret\d+$/u.test(secret))).toBe(true);
    expect(text).not.toMatch(/FakeSecret\d+[^"]/u);
  });

  it('RF-1404 holds the value in its own field, and every line that names it only as the token', async () => {
    const { set } = await load('shared-masked-value');
    const lines = set.cases.flatMap((each) => linesOf(each.input));

    const stray = set.cases.filter((each) =>
      linesOf(each.input).some((line) => line.includes((each.input as MaskedInput).secret)),
    );

    expect(stray.map((each) => each.id)).toEqual([]);
    expect(lines.some((line) => line.includes('{secret}'))).toBe(true);
  });

  it('RF-1404 gives every case one value the run masker hides, in at least four kinds', async () => {
    const { set } = await load('shared-masked-value');
    const masker = new SecretMasker();
    const kinds = new Set<string>();
    const leaks: string[] = [];

    for (const each of set.cases) {
      const input = each.input as MaskedInput;
      const text = linesOf(input).join('\n').replaceAll('{secret}', input.secret);
      const masked = masker.mask(text);
      if (masked.text.includes(input.secret)) leaks.push(each.id);
      for (const [kind, count] of Object.entries(masked.counts)) if (count > 0) kinds.add(kind);
    }

    expect(leaks).toEqual([]);
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('RF-1406 holds a line that is already masked, and every case is read as Valid', async () => {
    const { set } = await load('shared-masked-value');
    const lines = set.cases.flatMap((each) => linesOf(each.input));

    expect(lines.some((line) => line.includes('[MASKED:'))).toBe(true);
    expect(set.cases.every((each) => each.expected === 'Valid')).toBe(true);
  });
});

describe('the masked-value set, line by line', () => {
  it('RF-1404 leaves every line without the token unchanged for the run masker, so no literal value stands in a line', async () => {
    const { set } = await load('shared-masked-value');
    const masker = new SecretMasker();

    const changed = set.cases.flatMap((each) =>
      linesOf(each.input)
        .filter((line) => !line.includes('{secret}'))
        .filter((line) => masker.mask(line).text !== line)
        .map((line) => `${each.id}: ${line.slice(0, 40)}`),
    );

    expect(changed).toEqual([]);
  });

  it('RF-1404 makes the masker hide exactly the lines that hold the token', async () => {
    const { set } = await load('shared-masked-value');
    const masker = new SecretMasker();

    const problems = set.cases.flatMap((each) => {
      const input = each.input as MaskedInput;
      const lines = linesOf(input);
      const tokens = lines.filter((line) => line.includes('{secret}')).length;
      const filled = lines.map((line) => line.replaceAll('{secret}', input.secret));
      const counted = Object.values(masker.mask(filled.join('\n')).counts).reduce(
        (a, b) => a + b,
        0,
      );
      return counted === tokens
        ? []
        : [`${each.id}: ${String(counted)} masked, ${String(tokens)} lines`];
    });

    expect(problems).toEqual([]);
  });
});

describe('the text-tool-protocol set', () => {
  it('RF-1406 holds first turns that must call a tool and turns after reads that must answer', async () => {
    const { set } = await load('shared-text-tool-protocol');
    const hasReads = (input: unknown): boolean =>
      (input as { reads?: unknown }).reads !== undefined;

    const first = set.cases.filter((each) => !hasReads(each.input));
    const later = set.cases.filter((each) => hasReads(each.input));

    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(later.length).toBeGreaterThanOrEqual(3);
    expect(first.every((each) => each.expected === 'ReadsFiles')).toBe(true);
    expect(later.every((each) => each.expected === 'Valid')).toBe(true);
  });
});
