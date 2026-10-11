import { err, ok, type Result } from '../errors/result.js';
import type { Area } from './area.js';
import { byCodeUnit } from './code-unit-order.js';
import type { FileEntry } from './file-entry.js';
import type { LinkKind, SqlVerb, SymbolKind } from './vocabulary.js';

// RF-105, RF-106: the code map aggregate (data-model 3.4). It holds no time and no absolute path,
// and every list is in a fixed order, so the same input always gives the same map.

export interface CodeMapSource {
  readonly owner: string;
  readonly repo: string;
  readonly commitSha: string;
  /** '' for the whole repository. */
  readonly subpath: string;
}

export interface CodeSymbol {
  readonly path: string;
  readonly kind: SymbolKind;
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly container?: string;
}

export interface CodeLink {
  readonly from: string;
  /** Always a scanned file (RF-111). */
  readonly to: string;
  readonly kind: LinkKind;
  /** The class or name inside `to` that the link targets, when the source names one. */
  readonly symbol?: string;
}

export interface CodeSqlStatement {
  readonly path: string;
  readonly line: number;
  readonly verb: SqlVerb;
  /** At most 500 characters, secrets masked (RF-103, RF-141). */
  readonly text: string;
}

export interface CodeEntity {
  readonly name: string;
  readonly path: string;
  readonly startLine: number;
  readonly source: string;
}

interface LanguagePackUse {
  readonly name: string;
  readonly version: string;
}

export interface CodeMap {
  readonly schemaVersion: 1;
  readonly source: CodeMapSource;
  readonly files: readonly FileEntry[];
  readonly areas: readonly Area[];
  readonly symbols: readonly CodeSymbol[];
  readonly links: readonly CodeLink[];
  readonly sqlStatements: readonly CodeSqlStatement[];
  readonly entities: readonly CodeEntity[];
  readonly languagePacks: readonly LanguagePackUse[];
}

export type CodeMapInput = Omit<CodeMap, 'schemaVersion'>;

export type CodeMapProblem =
  | 'area-names-unknown-file'
  | 'area-tokens-mismatch'
  | 'duplicate-area-name'
  | 'duplicate-file'
  | 'file-in-no-area'
  | 'area-files-unsorted'
  | 'file-in-two-areas'
  | 'reference-to-unknown-file'
  | 'symbol-range-invalid';

const bySymbol = (a: CodeSymbol, b: CodeSymbol): number =>
  byCodeUnit(a.path, b.path) ||
  a.startLine - b.startLine ||
  byCodeUnit(a.name, b.name) ||
  byCodeUnit(a.kind, b.kind) ||
  a.endLine - b.endLine;
const byLink = (a: CodeLink, b: CodeLink): number =>
  byCodeUnit(a.from, b.from) ||
  byCodeUnit(a.to, b.to) ||
  byCodeUnit(a.kind, b.kind) ||
  byCodeUnit(a.symbol ?? '', b.symbol ?? '');
const bySql = (a: CodeSqlStatement, b: CodeSqlStatement): number =>
  byCodeUnit(a.path, b.path) || a.line - b.line || byCodeUnit(a.verb, b.verb);
const byEntity = (a: CodeEntity, b: CodeEntity): number =>
  byCodeUnit(a.path, b.path) || a.startLine - b.startLine || byCodeUnit(a.name, b.name);

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function isSorted(paths: readonly string[]): boolean {
  return paths.every((path, index) => index === 0 || byCodeUnit(paths[index - 1] ?? '', path) < 0);
}

function areaProblem(
  files: readonly FileEntry[],
  areas: readonly Area[],
): CodeMapProblem | undefined {
  if (hasDuplicates(areas.map((area) => area.name))) return 'duplicate-area-name';
  const tokens = new Map(files.map((file) => [file.path, file.estimatedTokens]));
  const placed = new Set<string>();
  for (const path of areas.flatMap((area) => area.files)) {
    if (!tokens.has(path)) return 'area-names-unknown-file';
    if (placed.has(path)) return 'file-in-two-areas';
    placed.add(path);
  }
  if (!areas.every((area) => isSorted(area.files))) return 'area-files-unsorted';
  if (placed.size !== files.length) return 'file-in-no-area';
  const wrong = areas.some(
    (area) =>
      area.files.reduce((sum, path) => sum + (tokens.get(path) ?? 0), 0) !== area.estimatedTokens,
  );
  return wrong ? 'area-tokens-mismatch' : undefined;
}

function referencesUnknownFile(input: CodeMapInput, known: ReadonlySet<string>): boolean {
  const paths = [
    ...input.symbols.map((symbol) => symbol.path),
    ...input.links.flatMap((link) => [link.from, link.to]),
    ...input.sqlStatements.map((statement) => statement.path),
    ...input.entities.map((entity) => entity.path),
  ];
  return paths.some((path) => !known.has(path));
}

/**
 * RF-104, RF-105, RF-106: checks the invariants (paths unique, every file in exactly one area,
 * every reference pointing at a listed file) and returns the map with every list sorted.
 */
export function createCodeMap(input: CodeMapInput): Result<CodeMap, CodeMapProblem> {
  const paths = input.files.map((file) => file.path);
  if (hasDuplicates(paths)) return err('duplicate-file');
  if (input.symbols.some((symbol) => symbol.endLine < symbol.startLine)) {
    return err('symbol-range-invalid');
  }
  const problem = areaProblem(input.files, input.areas);
  if (problem !== undefined) return err(problem);
  if (referencesUnknownFile(input, new Set(paths))) return err('reference-to-unknown-file');
  return ok({
    schemaVersion: 1,
    source: { ...input.source },
    files: [...input.files].sort((a, b) => byCodeUnit(a.path, b.path)),
    areas: [...input.areas].sort((a, b) => byCodeUnit(a.name, b.name)),
    symbols: [...input.symbols].sort(bySymbol),
    links: [...input.links].sort(byLink),
    sqlStatements: [...input.sqlStatements].sort(bySql),
    entities: [...input.entities].sort(byEntity),
    languagePacks: [...input.languagePacks].sort((a, b) => byCodeUnit(a.name, b.name)),
  });
}
