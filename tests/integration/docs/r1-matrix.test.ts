import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// RNF-005, P3-12: the release 1 verification matrix (docs/verification/r1-matrix.md) stays whole.
// Every release 1 requirement of the specification has a row; a Must row has evidence (a test
// count and an example test that exists) or names a follow-up card; and the requirements of the
// documentation set (P3-22: RF-260..RF-263, RF-508, RF-620..RF-627) are in it.

const ROOT = process.cwd();
const read = (path: string): Promise<string> => readFile(join(ROOT, path), 'utf8');

interface MatrixRow {
  readonly id: string;
  readonly priority: string;
  readonly tests: number;
  readonly example: string;
  readonly state: string;
}

/** The release 1 requirement ids of the specification, withdrawn ones left out. */
function releaseOneIds(requirements: string): readonly string[] {
  const functional = [...requirements.matchAll(/^\*\*(RF-\d+) [^*]+\*\* - R1\b/gmu)];
  const nonFunctional = [...requirements.matchAll(/^\| (RNF-\d+) \| \*\*/gmu)];
  return [...functional, ...nonFunctional].map((match) => match[1] ?? '');
}

/** The rows of the requirement table: `| Id | Requirement | Phase | Priority | U / I / E | Example | State |`. */
function matrixRows(matrix: string): readonly MatrixRow[] {
  return matrix
    .split('\n')
    .filter((line) => /^\| RN?F-\d+ /u.test(line))
    .map((line) => line.split(' | ').map((cell) => cell.replace(/^\| /u, '').trim()))
    .map(([id = '', , , priority = '', counts = '', example = '', state = '']) => ({
      ...{ id, priority, example, state },
      tests: counts.split(' / ').reduce((sum, count) => sum + Number(count), 0),
    }));
}

const requirements = await read('docs/spec/requirements.md');
// A missing matrix reads as an empty one, so the tests below fail on what it lacks.
const matrix = await read('docs/verification/r1-matrix.md').catch(() => '');
const rows = matrixRows(matrix);
const byId = new Map(rows.map((row) => [row.id, row]));

const range = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, at) => `${prefix}-${String(from + at)}`);

describe('the release 1 verification matrix', () => {
  it('RNF-005 lists every release 1 requirement of the specification once', () => {
    const ids = releaseOneIds(requirements);

    expect(ids.length).toBeGreaterThan(100);
    expect(ids.filter((id) => !byId.has(id))).toEqual([]);
    expect(rows.map((row) => row.id)).toEqual([...new Set(rows.map((row) => row.id))]);
  });

  it('RNF-005 gives every Must evidence or a follow-up card', () => {
    const must = rows.filter((row) => row.priority === 'Must');
    const bare = must.filter((row) => row.tests === 0 && !/card (P\d-\d+|G-\d+)/u.test(row.state));

    expect(must.length).toBeGreaterThan(100);
    expect(bare.map((row) => row.id)).toEqual([]);
  });

  it('RNF-005 points every example at a test file that exists', async () => {
    const examples = rows.filter((row) => row.example !== '-');
    const missing: string[] = [];
    for (const { example } of examples) {
      const path = example.replaceAll('`', '').split(':')[0] ?? '';
      await access(join(ROOT, path)).catch(() => missing.push(path));
    }

    expect(examples.length).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });

  it('RNF-005 includes the documentation set requirements of P3-22', () => {
    const set = [...range('RF', 260, 263), 'RF-508', ...range('RF', 620, 627)];

    expect(set.filter((id) => !byId.has(id))).toEqual([]);
  });
});
