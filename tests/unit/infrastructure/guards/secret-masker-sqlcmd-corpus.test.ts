import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  loadMaskedValuePrompt,
  maskedValueReplacement,
} from '../../../../src/infrastructure/prompts/masked-value-prompt.js';

// RF-141, RNF-003 (P10 masker gaps): the regression corpus of the SQL Server tool rule
// (tests/fixtures/guards/README.md). For both the plain and the explained masker: no secret part
// that develop masked survives, a second masking changes nothing, and every input develop left alone
// stays unchanged. Invented values only.

interface CorpusEntry {
  readonly text: string;
  readonly secrets: readonly string[];
  readonly keep: boolean;
}

let corpus: readonly CorpusEntry[] = [];

beforeAll(async () => {
  const json = await readFile('tests/fixtures/guards/sqlcmd-corpus.json', 'utf8');
  corpus = JSON.parse(json) as readonly CorpusEntry[];
});
const markers = /\[MASKED:[a-z-]+\]( \(a secret value[^)]*\))?/gu;

async function maskers(): Promise<readonly [string, SecretMasker][]> {
  const file = await loadMaskedValuePrompt('prompts');
  return [
    ['plain', new SecretMasker()],
    ['explained', new SecretMasker(undefined, maskedValueReplacement(file))],
  ];
}

function problemsOf(name: string, masker: SecretMasker, entry: CorpusEntry): string[] {
  const once = masker.mask(entry.text).text;
  const shown = once.replace(markers, '');
  return [
    ...entry.secrets.filter((part) => shown.includes(part)).map((part) => `leaks ${part}`),
    ...(masker.mask(once).text === once ? [] : ['changes when masked again']),
    ...(entry.keep && once !== entry.text ? ['changes an input left alone'] : []),
  ].map((problem) => `${name}: ${problem}: ${JSON.stringify(entry.text).slice(0, 160)}`);
}

describe('the regression corpus of the SQL Server tool rule', () => {
  it('holds inputs with secrets and inputs left alone', () => {
    expect(corpus.filter((entry) => entry.secrets.length > 0).length).toBeGreaterThan(200);
    expect(corpus.filter((entry) => entry.keep).length).toBeGreaterThan(80);
  });

  it('RF-141 masks every secret develop masked, idempotently, and changes nothing left alone', async () => {
    for (const [name, masker] of await maskers()) {
      const problems = corpus.flatMap((entry) => problemsOf(name, masker, entry));

      expect(problems).toEqual([]);
    }
  });
});

describe('the time of a flood of tool names after a delimiter or in quoted arguments', () => {
  it.each([
    ',bcp',
    ',sqlcmd',
    ';sqlcmd',
    '|sqlcmd',
    '[sqlcmd',
    'sqlcmd -Q "bcp" ',
    '"[CMD, sqlcmd, ',
  ])('stays linear on 1 MB of %j', (unit) => {
    const text = unit.repeat(Math.ceil(1_000_000 / unit.length));
    const started = performance.now();

    new SecretMasker().mask(text);

    expect(performance.now() - started).toBeLessThan(2000);
  });
});
