import { expect, it } from 'vitest';
import { book, cell, fileOf, num, sheet } from '../../../../support/rendered-workbook-fixtures.js';
import { projectOf, withFormula } from '../../../../support/dependency-fixtures.js';

// Q-38, RF-153, privacy rule of RF-150..RF-158: a property over generated formulas. Each formula mixes
// external paths (written without quotes, quoted around a bracket, without a bracket, or inside the
// bracket) whose folders hold any character Windows allows in a name, with structured table
// references and plain references. No folder text reaches formulas.md, workbook.md, validation.md
// or dependencies.md; the table references stay whole; the file name of every path is kept.

/** Characters a Windows folder or UNC share name may hold, besides letters and digits. */
const FOLDER_CHARS = [
  ' ',
  '-',
  '(',
  ')',
  '&',
  "'",
  '#',
  '$',
  '@',
  '!',
  ',',
  ';',
  '=',
  '+',
  '~',
  '.',
];
const LETTERS = ['a', 'B', 'z', 'ö', 'é', 'ñ', 'Ω', 'ж', '字'];
const TABLES = [
  'Table1[Col]',
  'Table1[[#This Row],[Rate-1]]',
  "Table1[Rate'#]",
  'T[[A]:[B]]',
  'Sales[@Qty]',
  'Table1[[#Headers],[Price]]',
] as const;
const PLAIN = ['A1', '$B$2:C9', "'Rates 2026'!$C$4", "'It''s'!B2", 'SUM(D1:D3)', '[1]Rates!C4'];
const JOINERS = ['+', '*', '&', ',', '-', '/'] as const;

class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(limit: number): number {
    this.state = (this.state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return Math.floor(this.state / 65_536) % limit;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.next(items.length)];
    if (item === undefined) throw new Error('Nothing to pick');
    return item;
  }
}

/** A folder name that carries the marker `usr<n>` and one to four legal characters around it. */
function folder(random: Random, marker: string): string {
  let name = marker;
  for (let i = 0, count = 1 + random.next(4); i < count; i += 1) {
    const piece = random.next(2) === 0 ? random.pick(FOLDER_CHARS) : random.pick(LETTERS);
    name = random.next(2) === 0 ? name + piece : piece + name;
  }
  return name;
}

function root(random: Random): string {
  return random.pick(['C:\\', 'D:\\', '\\\\srv\\', 'https://srv.example/']);
}

/**
 * A reference to `Rates.xlsx` in one of the forms a hand-made or third-party file may write. Inside
 * a quoted form an apostrophe of the folder is doubled, as Excel writes it; a path that holds one is
 * never written without quotes (Excel quotes it), so such a folder takes the quoted form.
 */
function externalReference(random: Random, marker: string): string {
  const base = root(random);
  const separator = base.startsWith('http') ? '/' : '\\';
  const depth = 1 + random.next(3);
  const folders = Array.from({ length: depth }, () => folder(random, marker)).join(separator);
  const path = `${base}${folders}${separator}`;
  const quoted = path.replaceAll("'", "''");
  const drawn = random.next(4);
  const form = drawn === 0 && path.includes("'") ? 1 : drawn;
  if (form === 0) return `${path}[Rates.xlsx]Rates!C5`;
  if (form === 1) return `'${quoted}[Rates.xlsx]Rates'!C5`;
  if (form === 2) return `'${quoted}Rates.xlsx'!TaxRate`;
  return `[${path}Rates.xlsx]Rates!C5`;
}

interface Generated {
  readonly formula: string;
  readonly markers: readonly string[];
  readonly tables: readonly string[];
}

function generated(seed: number): Generated {
  const random = new Random(seed);
  const markers: string[] = [];
  const tables: string[] = [];
  const parts: string[] = [];
  for (let i = 0, count = 2 + random.next(4); i < count; i += 1) {
    const kind = random.next(3);
    if (kind === 0) {
      const marker = `usr${String(seed)}x${String(i)}`;
      markers.push(marker);
      parts.push(externalReference(random, marker));
    } else if (kind === 1) {
      const table = random.pick(TABLES);
      tables.push(table);
      parts.push(table);
    } else {
      parts.push(random.pick(PLAIN));
    }
  }
  const joined = parts.map((part, i) => (i === 0 ? part : random.pick(JOINERS) + part)).join('');
  return { formula: random.next(2) === 0 ? `SUM(${joined})` : joined, markers, tables };
}

function renderedTexts(formula: string): string[] {
  const reader = book(
    [
      sheet('S', {
        cells: [cell('B1', num(1)), withFormula('A1', formula)],
        validations: [{ ranges: 'A2', type: 'list', formula1: formula }],
        tables: [{ name: 'Table1', range: 'D1:F3', columns: ['Col', 'Rate-1', "Rate'#"] }],
      }),
    ],
    {
      fileName: 'Reader.xlsx',
      externalLinks: [{ fileName: String.raw`C:\Users\x\Rates.xlsx` }],
      definedNames: [{ name: 'Rate', hidden: false, refersTo: formula }],
    },
  );
  const rates = book([sheet('Rates', { cells: [cell('C5', num(1))] })], {
    fileName: 'Rates.xlsx',
    definedNames: [{ name: 'TaxRate', hidden: false, refersTo: 'Rates!$C$5' }],
  });
  const project = projectOf([reader, rates]);
  const [first] = project.workbooks;
  if (first === undefined) throw new Error('No workbook rendered');
  return [
    fileOf(first, 'S/formulas.md'),
    fileOf(first, 'S/validation.md'),
    fileOf(first, 'workbook.md'),
    project.dependencies.content,
  ];
}

it('Q-38 lets no folder text of 400 generated formulas reach any rendered file', () => {
  const leaks: string[] = [];
  const broken: string[] = [];
  const lost: string[] = [];
  for (let seed = 1; seed <= 400; seed += 1) {
    const { formula, markers, tables } = generated(seed * 7919);
    const texts = renderedTexts(formula);
    const formulas = texts[0] ?? '';
    if (
      texts.some((text) => markers.some((marker) => text.includes(marker)) || text.includes('srv'))
    ) {
      leaks.push(formula);
    }
    if (!tables.every((table) => formulas.includes(table))) broken.push(formula);
    if (markers.length > 0 && !formulas.includes('[Rates.xlsx]')) lost.push(formula);
  }
  expect(leaks).toEqual([]);
  expect(broken).toEqual([]);
  expect(lost).toEqual([]);
});

it('Q-38 keeps the generator honest: it produces every path form and every folder character', () => {
  const formulas = Array.from({ length: 400 }, (_, i) => generated((i + 1) * 7919).formula);
  const all = formulas.join('\n');

  expect(formulas.some((f) => /[A-Z]:\\[^'[]*\[Rates\.xlsx\]/u.test(f))).toBe(true);
  expect(formulas.some((f) => /'[^']*\\\[Rates\.xlsx\]Rates'!/u.test(f))).toBe(true);
  expect(formulas.some((f) => f.includes("Rates.xlsx'!TaxRate"))).toBe(true);
  expect(formulas.some((f) => /\[[A-Z]:\\[^\]]*Rates\.xlsx\]/u.test(f))).toBe(true);
  expect(formulas.some((f) => f.includes('\\\\srv\\'))).toBe(true);
  for (const char of [...FOLDER_CHARS, ...LETTERS]) expect(all).toContain(char);
});
