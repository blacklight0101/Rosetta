import type { SourceCard } from './plan-sources.js';

// RF-623, P7-13, EV-31, EV-40: an `ENT` card the readers wrote about something that stores no data
// (a configuration class, a view model, a registration of a service, a glossary of a workbook's
// controls, the workbook file itself) is no table. Only the card's title is read, as words (camel
// case split), and a title that names a table, a sheet, rows or records is data whatever else it
// says. The names are those of the cards the evaluation produced; checks.md lists each card skipped
// with its kind, and a wrong guess costs one line to put back, never a silent loss.

const data = new Set(['table', 'tables', 'sheet', 'sheets', 'rows', 'records']);
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

/** The kinds that are data when the title also names a table, a sheet, rows or records. */
function unlessStored(has: Has, title: string, words: readonly string[]): string | undefined {
  if (workbookFile.test(title) || has('workbook')) return 'workbook file';
  if (has('registration') && words.some((word) => codeAround.has(word))) return 'registration';
  return has('configuration', 'config', 'parameters') ? 'configuration' : undefined;
}

function kindOf(title: string, words: readonly string[]): string | undefined {
  const has: Has = (...wanted) => wanted.some((word) => words.includes(word));
  return alwaysKind(has, words) ?? (has(...data) ? undefined : unlessStored(has, title, words));
}

/** Why the card needs no table (a configuration, a view model, ...); undefined when it describes stored data. */
// RF-623
export function noStoredData(card: SourceCard): string | undefined {
  return kindOf(card.title, wordsOf(card.title));
}
