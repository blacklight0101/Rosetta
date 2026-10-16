import type { Area } from '../../domain/code-map/area.js';
import type {
  CodeEntity,
  CodeLink,
  CodeSqlStatement,
  CodeSymbol,
} from '../../domain/code-map/code-map.js';
import type { FileEntry } from '../../domain/code-map/file-entry.js';
import type { FileDetails } from './code-map-index.js';

// RF-201: the plain-text lines of the tool results. The text goes into a data block as it is, so
// it carries repository names and paths but no instruction of Rosetta's own beyond short notices.

/** How many of the lines fit in `maxChars`, counting a line break between two lines. */
export function linesThatFit(lines: readonly string[], maxChars: number): number {
  let used = 0;
  for (const [index, line] of lines.entries()) {
    used += line.length + (index === 0 ? 0 : 1);
    if (used > maxChars) return index;
  }
  return lines.length;
}

/** The first `max` lines that fit in `maxChars`, with a notice when any were left out. */
export function boundedList(
  lines: readonly string[],
  limits: { readonly max: number; readonly maxChars: number },
  what: string,
): string[] {
  const kept = lines.slice(0, linesThatFit(lines.slice(0, limits.max), limits.maxChars));
  const left = lines.length - kept.length;
  return left === 0 ? kept : [...kept, `(${String(left)} more ${what} not shown)`];
}

/** A line cut to `maxChars` units, never ending in half of a surrogate pair (one character). */
export function cutLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) return line;
  const lastKept = line.charCodeAt(maxChars - 1);
  const end = lastKept >= 0xd800 && lastKept <= 0xdbff ? maxChars - 1 : maxChars;
  return line.slice(0, end);
}

/** The language and size of a listed file, or why the scan skipped it. */
function fileFacts(file: FileEntry): string {
  const size =
    file.skipped === undefined ? `${String(file.lines)} lines` : `skipped: ${file.skipped}`;
  return `${file.language}, ${size}`;
}

export function fileLine(file: FileEntry): string {
  return `${file.path} (${fileFacts(file)})`;
}

export function areaHeading(area: Area): string[] {
  return [`area: ${area.name}`, `files: ${String(area.files.length)}`];
}

export function symbolLine(symbol: CodeSymbol): string {
  const name = symbol.container === undefined ? symbol.name : `${symbol.container}.${symbol.name}`;
  const range = `${String(symbol.startLine)}-${String(symbol.endLine)}`;
  return `${symbol.kind} ${name} ${symbol.path}:${range}`;
}

export function entityLine(entity: CodeEntity): string {
  return `entity ${entity.name} ${entity.path}:${String(entity.startLine)}`;
}

function linkLine(link: CodeLink): string {
  const symbol = link.symbol === undefined ? '' : ` (${link.symbol})`;
  return `${link.kind} ${link.from} -> ${link.to}${symbol}`;
}

function sqlLine(statement: CodeSqlStatement): string {
  return `${statement.verb} ${statement.path}:${String(statement.line)}: ${statement.text}`;
}

export function detailLines(details: FileDetails): string[] {
  const { entry, area } = details;
  const areaName = area === undefined ? '' : `, area ${area}`;
  return [
    `file ${entry.path} (${fileFacts(entry)}${areaName})`,
    ...details.symbols.map(symbolLine),
    ...details.entities.map(entityLine),
    ...details.links.map(linkLine),
    ...details.sqlStatements.map(sqlLine),
  ];
}
