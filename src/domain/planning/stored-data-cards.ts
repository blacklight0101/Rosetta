import type { SourceCard } from './plan-sources.js';

// RF-623, P7-13, EV-31, EV-40: an `ENT` card the readers wrote about something that stores no data
// (a configuration class, a view model, a registration of a service, a glossary of a workbook's
// controls, the workbook file itself, a class that only serves) is no table. The title is read as
// words (camel case split), and a title that names a table, a sheet, rows, records or an entity is
// data whatever else it says. A card whose supported claims state stored data (a column with its
// type, a key, a precision, nullability) is kept whatever its title, so its facts reach the planner,
// except a view model or a glossary, which never is, and a workbook file, which is kept only when a
// claim states a typed column (`Column T.c: type` or a sized type) or its title names a table, a sheet,
// rows or records. The names are those of the cards the evaluation produced; checks.md lists each card skipped
// with its kind, and a wrong guess costs one line to put back, never a silent loss.

const data = new Set([
  'table',
  'tables',
  'sheet',
  'sheets',
  'rows',
  'records',
  'entity',
  'entities',
]);
const codeAround = new Set(['context', 'service', 'services', 'container', 'dependency', 'module']);
const workbookFile = /\.(?:xlsx?|xlsm|xlsb|xltx?)\b/iu;

function wordsOf(title: string): string[] {
  return title
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== '');
}

type Has = (...wanted: string[]) => boolean;

/** The kinds that are no data even when the title says table: a view model and a glossary. */
function alwaysKind(has: Has, words: readonly string[]): string | undefined {
  if (has('viewmodel') || words.join(' ').includes('view model')) return 'view model';
  return has('glossary') ? 'glossary' : undefined;
}

/** The kinds that are data when the title also names a table, a sheet, rows or records (a workbook file is told apart in kindOf). */
function unlessStored(has: Has, words: readonly string[]): string | undefined {
  if (has('registration') && words.some((word) => codeAround.has(word))) return 'registration';
  return has('configuration', 'config', 'parameters') ? 'configuration' : undefined;
}

const stored =
  /\bcolumns?\b|\btable\b|\bprecision\b|\bprimary key\b|\bforeign key\b|\bnullable\b|\bnot null\b|\bunicode\b|\b(?:n?varchar|decimal|numeric|bigint|datetime2?)\s*\(/iu;
// A typed column fact (`Column T.c: type`) or a sized type: the word "column" alone is not enough.
const typedColumn =
  /\bColumn\s+\w+\.\w+\s*:|\b(?:n?varchar|decimal|numeric|bigint|datetime2?)\s*\(/iu;
// Plain words that say rows are stored, for a class named like a serving one (PaymentProvider).
const storedInProse = /\b(?:stored|kept|persisted|saved)\b|\brows?\b/iu;
const serving = new Set(['service', 'helper', 'container', 'factory', 'provider']);

/** A title written as the name of a class (no spaces, two words or more) that ends in a serving word. */
function servingClass(title: string, words: readonly string[]): boolean {
  const last = words[words.length - 1] ?? '';
  return /^[A-Za-z0-9_]+$/u.test(title) && words.length > 1 && serving.has(last);
}

function kindOf(card: SourceCard, words: readonly string[]): string | undefined {
  const { title } = card;
  const says = (pattern: RegExp): boolean =>
    card.claims.some((claim) => claim.status === 'Supported' && pattern.test(claim.text));
  const has: Has = (...wanted) => wanted.some((word) => words.includes(word));
  const always = alwaysKind(has, words);
  if (always !== undefined) return always;
  if (workbookFile.test(title) || has('workbook')) {
    return says(typedColumn) || has(...data) ? undefined : 'workbook file';
  }
  if (says(stored)) return undefined;
  if (servingClass(title, words)) return says(storedInProse) ? undefined : 'service class';
  return has(...data) ? undefined : unlessStored(has, words);
}

/** Why the card needs no table (a configuration, a view model, ...); undefined when it describes stored data. */
// RF-623
export function noStoredData(card: SourceCard): string | undefined {
  return kindOf(card, wordsOf(card.title));
}
