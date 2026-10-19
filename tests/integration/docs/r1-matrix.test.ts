import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  matrixProblems,
  matrixRows,
  releaseOneIds,
  type GuardInput,
} from '../../support/r1-matrix-guard.js';

// RNF-005, P3-12, P3-35: the release 1 verification matrix (docs/verification/r1-matrix.md) stays
// whole. Every release 1 requirement of the specification has a row; a Must row has evidence (three
// whole-number test counts, a card that exists in docs/orchestration/tasks.md, or a card the matrix
// proposes) and the priority the specification gives; every example points at a line inside a test
// that names the id; and the requirements of the documentation set (P3-22: RF-260..RF-263, RF-508,
// RF-620..RF-627) are in it. The guard is also run on bad matrices, so it is seen to fail.

const ROOT = process.cwd();
const read = (path: string): Promise<string> => readFile(join(ROOT, path), 'utf8');
const readOrUndefined = (path: string): Promise<string | undefined> =>
  read(path).catch(() => undefined);

const requirements = await read('docs/spec/requirements.md');
const tasks = await read('docs/orchestration/tasks.md');
// A missing matrix reads as an empty one, so the tests below fail on what it lacks.
const matrix = await read('docs/verification/r1-matrix.md').catch(() => '');
const rows = matrixRows(matrix);
const byId = new Map(rows.map((row) => [row.id, row]));

const input = (text: string): GuardInput => ({
  requirements,
  matrix: text,
  tasks,
  readFile: readOrUndefined,
});

/** The row of one requirement, as a line of the matrix. */
function rowLine(id: string): string {
  const line = matrix.split('\n').find((each) => each.startsWith(`| ${id} `));
  if (line === undefined) throw new Error(`The matrix has no row for ${id}`);
  return line;
}

/** The matrix with one requirement's row changed by `change`. */
function withRow(id: string, change: (line: string) => string): string {
  const line = rowLine(id);
  return matrix.replace(line, change(line));
}

const mentions = (problems: readonly string[], text: string): number =>
  problems.filter((problem) => problem.includes(text)).length;

const range = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, at) => `${prefix}-${String(from + at)}`);

describe('the release 1 verification matrix', () => {
  it('RNF-005 lists every release 1 requirement of the specification once', () => {
    const ids = releaseOneIds(requirements);

    expect(ids.length).toBeGreaterThan(100);
    expect(ids.filter((id) => !byId.has(id))).toEqual([]);
    expect(rows.map((row) => row.id)).toEqual([...new Set(rows.map((row) => row.id))]);
  });

  it('RNF-005 passes its own guard: counts, priorities, cards and examples', async () => {
    expect(rows.filter((row) => row.priority === 'Must').length).toBeGreaterThan(100);
    expect(rows.filter((row) => row.example !== '-').length).toBeGreaterThan(100);
    expect(await matrixProblems(input(matrix))).toEqual([]);
  });

  it('RNF-005 includes the documentation set requirements of P3-22', () => {
    const set = [...range('RF', 260, 263), 'RF-508', ...range('RF', 620, 627)];

    expect(set.filter((id) => !byId.has(id))).toEqual([]);
  });
});

describe('the guard of the release 1 verification matrix', () => {
  it('RNF-005 fails a Must row whose counts are - / - / -', async () => {
    const bad = withRow('RF-003', (line) => line.replace('31 / 13 / 0', '- / - / -'));

    expect(mentions(await matrixProblems(input(bad)), 'RF-003:')).toBeGreaterThan(0);
  });

  it('RNF-005 fails a row that names a card that is not in tasks.md', async () => {
    const bad = withRow('RF-615', (line) => line.replace('card P3-30', 'card P9-99'));

    expect(mentions(await matrixProblems(input(bad)), 'P9-99')).toBe(1);
  });

  it('RNF-005 fails a row that names a proposed card the matrix does not propose', async () => {
    const bad = withRow('RNF-011', (line) => line.replace('proposed card A', 'card Z'));

    expect(mentions(await matrixProblems(input(bad)), 'card Z')).toBe(1);
  });

  it('RNF-005 fails a Must relabelled Should that has no tests, as the specification decides', async () => {
    const bad = withRow('RF-003', (line) =>
      line.replace('| Must     | 31 / 13 / 0 ', '| Should   | 0 / 0 / 0   '),
    );

    expect(mentions(await matrixProblems(input(bad)), 'RF-003:')).toBeGreaterThan(0);
  });

  it('RNF-005 fails an example that points at the first line of a file', async () => {
    const bad = withRow('RF-003', (line) => line.replace(/(pg-run-index\.test\.ts):\d+/u, '$1:1'));

    expect(mentions(await matrixProblems(input(bad)), 'RF-003:')).toBeGreaterThan(0);
  });

  it('RNF-005 fails an example whose file does not exist', async () => {
    const bad = withRow('RF-003', (line) => line.replace('pg-run-index', 'no-such-file'));

    expect(mentions(await matrixProblems(input(bad)), 'RF-003:')).toBeGreaterThan(0);
  });
});
