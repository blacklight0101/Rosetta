// RNF-005, P3-12: the checks behind tests/integration/docs/r1-matrix.test.ts, as the card P3-12
// left them. They take the text of the specification, of the matrix and of the task list.

export interface MatrixRow {
  readonly id: string;
  readonly priority: string;
  readonly tests: number;
  readonly example: string;
  readonly state: string;
}

export interface GuardInput {
  readonly requirements: string;
  readonly matrix: string;
  readonly tasks: string;
  /** Reads a file of the repository; undefined when it does not exist. */
  readonly readFile: (path: string) => Promise<string | undefined>;
}

/** The release 1 requirement ids of the specification, withdrawn ones left out. */
export function releaseOneIds(requirements: string): readonly string[] {
  const functional = [...requirements.matchAll(/^\*\*(RF-\d+) [^*]+\*\* - R1\b/gmu)];
  const nonFunctional = [...requirements.matchAll(/^\| (RNF-\d+) \| \*\*/gmu)];
  return [...functional, ...nonFunctional].map((match) => match[1] ?? '');
}

/** The rows of the requirement table: `| Id | Requirement | Phase | Priority | U / I / E | Example | State |`. */
export function matrixRows(matrix: string): readonly MatrixRow[] {
  const section = matrix.split('\n## 4. Requirement matrix\n')[1] ?? '';
  return (section.split('\n## ')[0] ?? '')
    .split('\n')
    .filter((line) => /^\| RN?F-\d+ /u.test(line))
    .map((line) => line.split(' | ').map((cell) => cell.replace(/^\| /u, '').trim()))
    .map(([id = '', , , priority = '', counts = '', example = '', state = '']) => ({
      ...{ id, priority, example, state },
      tests: counts.split(' / ').reduce((sum, count) => sum + Number(count), 0),
    }));
}

/** Everything wrong with the matrix. */
export async function matrixProblems(input: GuardInput): Promise<readonly string[]> {
  const rows = matrixRows(input.matrix);
  const bare = rows
    .filter((row) => row.priority === 'Must')
    .filter((row) => row.tests === 0 && !/card (P\d-\d+|[A-Z]\b)/u.test(row.state))
    .map((row) => `${row.id}: a Must without a test and without a card`);
  const missing: string[] = [];
  for (const row of rows.filter((each) => each.example !== '-')) {
    const path = row.example.replaceAll('`', '').split(':')[0] ?? '';
    if ((await input.readFile(path)) === undefined)
      missing.push(`${row.id}: the example file ${path} does not exist`);
  }
  return [...bare, ...missing];
}
