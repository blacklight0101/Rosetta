// RF-156, RFC-005 section 4.4: the label beside a citation to a rendered workbook file. Every rendered
// line starts with the cells it describes, so the lines a citation covers say which cells it is about.
// The workbook is the folder named after the file (`Pricing.xlsx/`), the sheet the folder below it,
// and the file one of the four sheet files; `workbook.md`, `dependencies.md` and the macro files
// carry no cells and get no label.

const SHEET_FILES = ['formulas.md', 'values.md', 'validation.md', 'notes.md'];
const WORKBOOK_FOLDER = /\.xls[xm](?:~\d+)?$/iu;
const LINE_START = /^([A-Z]{1,3}[0-9]{1,7}(?::[A-Z]{1,3}[0-9]{1,7})?)(?=[\s{]|$)/u;
const FIELD_START = /^([A-Z]{1,3}[0-9]{1,7})(?=\s|$)/u;
const ROW_MARKER = /^R[0-9]+$/u;
const SHOWN_CELLS = 6;
const RANGE_TOKEN = /^[A-Z]{1,3}[0-9]{1,7}(?::[A-Z]{1,3}[0-9]{1,7})?$/u;
/** A rule line names at most this many ranges before its rule word (the renderer writes at most 40). */
const MAX_RULE_RANGES = 40;
const RULE_WORDS = new Set(['validation', 'conditional']);

/** The ranges a validation or conditional rule line starts with, when a rule word follows them. */
function rangesOfRuleLine(line: string): string[] | undefined {
  const tokens = line.split(' ', MAX_RULE_RANGES + 1);
  const end = tokens.findIndex((token) => !RANGE_TOKEN.test(token));
  const word = tokens[end];
  return end > 0 && word !== undefined && RULE_WORDS.has(word) ? tokens.slice(0, end) : undefined;
}

/** The fields of a values line, split at ` | ` outside a quoted text (a text is JSON-escaped). */
function fieldsOf(line: string): string[] {
  const fields: string[] = [];
  let start = 0;
  let quoted = false;
  for (let at = 0; at < line.length; at += 1) {
    const char = line.charAt(at);
    if (quoted && char === '\\') at += 1;
    else if (char === '"') quoted = !quoted;
    else if (!quoted && line.startsWith(' | ', at)) {
      fields.push(line.slice(start, at));
      start = at + 3;
    }
  }
  fields.push(line.slice(start));
  return fields;
}

function cellsOfValuesLine(line: string): string[] {
  const [first, ...rest] = fieldsOf(line);
  if (first === undefined || !ROW_MARKER.test(first.trim())) return [];
  return rest.flatMap((field) => FIELD_START.exec(field.trim())?.[1] ?? []);
}

function cellsOfLine(file: string, line: string): string[] {
  if (file === 'values.md') return cellsOfValuesLine(line);
  if (file === 'validation.md') {
    const ranges = rangesOfRuleLine(line);
    if (ranges !== undefined) return ranges;
  }
  const cell = LINE_START.exec(line)?.[1];
  return cell === undefined ? [] : [cell];
}

function cellsText(cells: readonly string[]): string {
  const shown = cells.slice(0, SHOWN_CELLS).join(', ');
  const more = cells.length - SHOWN_CELLS;
  return more > 0 ? `${shown} and ${String(more)} more` : shown;
}

/**
 * `Pricing.xlsx, sheet Summary, cells B12, B13` for the cited lines of a rendered sheet file;
 * undefined for any other file. Lines that carry no cell (a region heading) add none.
 */
// RF-156
export function workbookCellLabel(path: string, lines: readonly string[]): string | undefined {
  const [file, sheet, workbook] = path.split('/').reverse();
  if (sheet === undefined || file === undefined || workbook === undefined) return undefined;
  if (!SHEET_FILES.includes(file) || !WORKBOOK_FOLDER.test(workbook)) return undefined;
  const cells = [...new Set(lines.flatMap((line) => cellsOfLine(file, line)))];
  const where = `${workbook}, sheet ${sheet}`;
  return cells.length === 0 ? where : `${where}, cells ${cellsText(cells)}`;
}
