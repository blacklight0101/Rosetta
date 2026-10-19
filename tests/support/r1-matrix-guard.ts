// RNF-005, P3-12, P3-35: the checks behind tests/integration/docs/r1-matrix.test.ts. They take the
// text of the specification, of the matrix and of the task list, so a test can feed them a bad
// matrix and see them fail.

export interface MatrixRow {
  readonly id: string;
  readonly priority: string;
  /** The three counts (unit, integration, end to end); a cell that is not a whole number is NaN. */
  readonly counts: readonly number[];
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

const wholeNumber = /^\d+$/u;

/** The release 1 requirement ids of the specification, withdrawn ones left out. */
export function releaseOneIds(requirements: string): readonly string[] {
  const functional = [...requirements.matchAll(/^\*\*(RF-\d+) [^*]+\*\* - R1\b/gmu)];
  const nonFunctional = [...requirements.matchAll(/^\| (RNF-\d+) \| \*\*/gmu)];
  return [...functional, ...nonFunctional].map((match) => match[1] ?? '');
}

/** The priority the specification gives each functional requirement (Must, Should, Could). */
function specPriorities(requirements: string): ReadonlyMap<string, string> {
  const found = [
    ...requirements.matchAll(/^\*\*(RF-\d+) [^*]+\*\* - R\d(?: \([^)]*\))? - (\w+)\b/gmu),
  ];
  return new Map(found.map((match) => [match[1] ?? '', match[2] ?? '']));
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
      counts: counts
        .split(' / ')
        .map((count) => (wholeNumber.test(count) ? Number(count) : Number.NaN)),
    }));
}

const total = (row: MatrixRow): number => row.counts.reduce((sum, count) => sum + count, 0);

/** The ids of the cards the task list defines (`### P3-12 - Title`). */
function taskCardIds(tasks: string): ReadonlySet<string> {
  return new Set([...tasks.matchAll(/^### (P\d-\d+) - /gmu)].map((match) => match[1] ?? ''));
}

/** The letters of the cards the matrix proposes (`**Proposed card A - ...**`). */
function proposedLetters(matrix: string): ReadonlySet<string> {
  return new Set([...matrix.matchAll(/^- \*\*Proposed card ([A-Z]) - /gmu)].map((m) => m[1] ?? ''));
}

/** The card names a State cell mentions: `card P3-30`, `cards P1-50 (...) and P3-22`, `card A`. */
function namedCards(state: string): readonly string[] {
  const phrases = [...state.matchAll(/\bcards? ((?:P\d-\d+|[A-Z]\b)(?:[^;.]*?(?:P\d-\d+))*)/gu)];
  return phrases.flatMap((phrase) => [...(phrase[1] ?? '').matchAll(/P\d-\d+|\b[A-Z]\b/gu)]).flat();
}

function cardProblems(row: MatrixRow, known: ReadonlySet<string>, letters: ReadonlySet<string>) {
  return namedCards(row.state)
    .filter((card) => !known.has(card) && !letters.has(card))
    .map((card) => `${row.id}: the state names card ${card}, which does not exist`);
}

function hasCard(row: MatrixRow, known: ReadonlySet<string>, letters: ReadonlySet<string>) {
  return namedCards(row.state).some((card) => known.has(card) || letters.has(card));
}

function rowProblems(
  row: MatrixRow,
  spec: ReadonlyMap<string, string>,
  known: ReadonlySet<string>,
  letters: ReadonlySet<string>,
): string[] {
  const problems = cardProblems(row, known, letters);
  if (row.counts.length !== 3 || row.counts.some(Number.isNaN))
    problems.push(`${row.id}: the counts "${row.counts.join(' / ')}" are not three whole numbers`);
  const expected = spec.get(row.id) ?? 'NFR';
  if (row.priority !== expected)
    problems.push(`${row.id}: the matrix says ${row.priority}, the specification says ${expected}`);
  if (expected === 'Must' && !(total(row) > 0) && !hasCard(row, known, letters))
    problems.push(`${row.id}: a Must without a test and without a card that exists`);
  return problems;
}

/** The ids a title names; `RF-620..RF-627` names every id inside the range. */
function namesId(title: string, id: string): boolean {
  if (title.includes(id)) return true;
  const [prefix = '', number = ''] = id.split('-');
  return [...title.matchAll(/(RN?F)-(\d+)\.\.(?:RN?F-)?(\d+)/gu)].some(
    (range) =>
      range[1] === prefix &&
      Number(number) >= Number(range[2]) &&
      Number(number) <= Number(range[3]),
  );
}

const startsTest = /^\s*(?:it|test)(?:\.\w+)*\(/u;
const startsGroup = /^\s*(?:describe|test\.describe)(?:\.\w+)*\(/u;

/** The title of the test or group that starts at a line: the line and the two after it. */
const titleAt = (lines: readonly string[], at: number): string => lines.slice(at, at + 3).join(' ');

/** Whether the line sits inside a test whose name, or whose describe title, carries the id. */
export function lineNamesId(source: string, line: number, id: string): boolean {
  const lines = source.split('\n');
  const before = lines.slice(0, line);
  const test = before.findLastIndex((text) => startsTest.test(text));
  if (test >= 0 && namesId(titleAt(lines, test), id)) return true;
  const group = before.findLastIndex((text) => startsGroup.test(text));
  return group >= 0 && namesId(titleAt(lines, group), id);
}

async function exampleProblems(row: MatrixRow, input: GuardInput): Promise<string[]> {
  if (row.example === '-') return [];
  const [path = '', line = ''] = row.example.replaceAll('`', '').split(':');
  const source = await input.readFile(path);
  if (source === undefined) return [`${row.id}: the example file ${path} does not exist`];
  const at = Number(line);
  if (!Number.isInteger(at) || at < 1) return [`${row.id}: the example has no line number`];
  return lineNamesId(source, at, row.id)
    ? []
    : [`${row.id}: ${path}:${line} is not inside a test that names ${row.id}`];
}

/** Everything wrong with the matrix: counts, priorities, cards that do not exist, examples. */
export async function matrixProblems(input: GuardInput): Promise<readonly string[]> {
  const spec = specPriorities(input.requirements);
  const known = taskCardIds(input.tasks);
  const letters = proposedLetters(input.matrix);
  const rows = matrixRows(input.matrix);
  const fromRows = rows.flatMap((row) => rowProblems(row, spec, known, letters));
  const fromExamples = await Promise.all(rows.map((row) => exampleProblems(row, input)));
  return [...fromRows, ...fromExamples.flat()];
}
