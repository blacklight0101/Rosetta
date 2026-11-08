// P8-142 (DEC-227, RNF-005): the quarantine list, tests/quarantine.json. Each entry names one confirmed
// flaky test: `file` (from the repository root), `title` (describe blocks then the test title; a
// shorter path quarantines a whole describe block), `owner` (GitHub login), `issue` (number), `until`
// (last day, YYYY-MM-DD, UTC) and `flakeRun` (the CI run whose P8-54 report confirmed the flake).
// The required runs skip the listed tests; the quarantine job runs only them
// (docs/runbooks/ci-throughput.md section 6). scripts/quarantine.d.mts declares this module.
import { readFile } from 'node:fs/promises';

export const QUARANTINE_FILE = 'tests/quarantine.json';

const vitestFile = /^tests\/.+\.test\.tsx?$/u;
const playwrightFile = /^tests\/e2e\/.+\.spec\.ts$/u;
const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/u;
const githubLogin = /^[A-Za-z\d](?:[A-Za-z\d-]{0,38})$/u;
const runUrl = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+(?:\/job\/\d+)?$/u;
// Playwright's --test-list splits a line on "›", so a title part must not hold one or a line break.
const titlePart = /^[^›\r\n]+$/u;

export const isVitestFile = (file) => vitestFile.test(file);
export const isPlaywrightFile = (file) => playwrightFile.test(file);

/** A YYYY-MM-DD that names a real day of the calendar. */
function isDay(text) {
  const match = isoDate.exec(typeof text === 'string' ? text : '');
  if (match === null) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const isTitle = (title) =>
  Array.isArray(title) && title.length > 0 && title.every((part) => matches(titlePart, part));

/** Each field's rule and the problem when an entry breaks it. */
const rules = [
  [
    (e) => isVitestFile(e.file) || isPlaywrightFile(e.file),
    'file must be a test file under tests/',
  ],
  [(e) => isTitle(e.title), 'title must be a non-empty list of titles without "›" or a line break'],
  [(e) => matches(githubLogin, e.owner), 'no owner (a GitHub login)'],
  [(e) => Number.isInteger(e.issue) && e.issue > 0, 'no issue (its number)'],
  [
    (e) => matches(runUrl, e.flakeRun),
    'no flakeRun (https://github.com/<o>/<r>/actions/runs/<id>)',
  ],
  [(e) => isDay(e.until), 'until must be a day, YYYY-MM-DD'],
];

/** The problems of one entry, without its label. */
function entryProblems(entry, today) {
  const problems = rules.filter(([valid]) => !valid(entry)).map(([, problem]) => problem);
  if (isDay(entry.until) && entry.until < today) problems.push(`until ${entry.until} has passed`);
  return problems;
}

/** "entry <n> (<file> › <title>)" for the messages. */
function labelOf(entry, index) {
  const title = Array.isArray(entry.title) ? entry.title.map(String) : [];
  return `entry ${String(index)} (${[String(entry.file), ...title].join(' › ')})`;
}

/** Every problem of the list on the given day (YYYY-MM-DD); an empty list of problems passes. */
export function quarantineProblems(raw, today) {
  if (!Array.isArray(raw)) return ['the list must be a JSON array'];
  return raw.flatMap((entry, index) => {
    if (typeof entry !== 'object' || entry === null)
      return [`entry ${String(index)}: not an object`];
    return entryProblems(entry, today).map((problem) => `${labelOf(entry, index)}: ${problem}`);
  });
}

/**
 * The entries of the list; none when the file does not exist. A list that is not an array of
 * entries with a file and a title stops the run: the guard test says what is wrong with it.
 */
export async function readQuarantine(path = QUARANTINE_FILE) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const raw = JSON.parse(text);
  const usable =
    Array.isArray(raw) &&
    raw.every((entry) => typeof entry?.file === 'string' && Array.isArray(entry.title));
  if (!usable) throw new Error(`${path}: every entry needs a file and a title list.`);
  return raw;
}

/** Whether a test (file from the repository root, then its title path) is on the list. */
export function isQuarantined(entries, file, titles) {
  return entries.some(
    (entry) =>
      entry.file === file &&
      entry.title.length <= titles.length &&
      entry.title.every((part, index) => titles[index] === part),
  );
}

/** The Playwright entries as a --test-list file: "<file under tests/e2e> › <title> › ...". */
export function playwrightTestList(entries) {
  return entries
    .filter((entry) => isPlaywrightFile(entry.file))
    .map((entry) => `${[entry.file.slice('tests/e2e/'.length), ...entry.title].join(' › ')}\n`)
    .join('');
}
