import type { TextMasker } from '../../guards/secret-masker.js';
import type { ConfiguredArea, GroupingProblem } from '../../../domain/code-map/area-grouping.js';
import { groupIntoAreas } from '../../../domain/code-map/area-grouping.js';
import {
  createCodeMap,
  type CodeEntity,
  type CodeLink,
  type CodeMap,
  type CodeMapProblem,
  type CodeMapSource,
  type CodeSqlStatement,
  type CodeSymbol,
} from '../../../domain/code-map/code-map.js';
import {
  createFileEntry,
  type FileEntry,
  type FileEntryProblem,
} from '../../../domain/code-map/file-entry.js';
import type { MapLevel } from '../../../domain/code-map/map-level.js';
import { err, type Result } from '../../../domain/errors/result.js';
import { pathFilter } from '../../files/ignore-rules.js';
import type { PackScan } from '../packs/pack-scan.js';
import type { ScannedFile, UniversalScan } from '../universal/scan-types.js';

// RF-104, RF-105, RF-141: joins the universal scan and the language-pack analysis into the code
// map. Every piece of text taken from a repository file goes through the SecretMasker here, so
// nothing downstream (the JSON writer, the summary) ever sees an unmasked secret.

/** `scan.areas`: a manual area and the gitignore-style patterns of the files it takes. */
interface ConfiguredAreaSettings {
  readonly name: string;
  readonly include: readonly string[];
}

export interface BuildCodeMapInput {
  readonly source: CodeMapSource;
  readonly scan: Pick<UniversalScan, 'files' | 'sqlStatements'>;
  readonly packs: Pick<PackScan, 'entities' | 'fileLevels' | 'languagePacks' | 'links' | 'symbols'>;
  /** `scan.areaTokenBudget`. */
  readonly areaTokenBudget: number;
  /** `scan.areas`. */
  readonly configuredAreas: readonly ConfiguredAreaSettings[];
  readonly masker: TextMasker;
}

export type BuildCodeMapProblem = CodeMapProblem | FileEntryProblem | GroupingProblem;

/** RF-103: a statement is recorded with at most this many characters. */
const maxStatementCharacters = 500;

function entryOf(file: ScannedFile, mapLevel: MapLevel): FileEntry {
  return {
    path: file.path,
    language: file.language,
    lines: file.lines,
    estimatedTokens: file.estimatedTokens,
    ...(file.sha256 === undefined ? {} : { sha256: file.sha256 }),
    artefactKinds: file.artefactKinds,
    mapLevel,
    ...(file.skipped === undefined ? {} : { skipped: file.skipped }),
  };
}

function fileEntries(input: BuildCodeMapInput): Result<FileEntry[], FileEntryProblem> {
  const levels = new Map(input.packs.fileLevels.map((level) => [level.path, level.mapLevel]));
  const entries: FileEntry[] = [];
  for (const file of input.scan.files) {
    const made = createFileEntry(entryOf(file, levels.get(file.path) ?? 'coarse'));
    if (!made.ok) return made;
    entries.push(made.value);
  }
  return { ok: true, value: entries };
}

function configuredAreaOf(settings: ConfiguredAreaSettings): ConfiguredArea {
  return { name: settings.name, matches: pathFilter(settings.include.join('\n')) };
}

/** The masked text of the free-text fields the packs and the SQL extractor took from source files. */
function maskedTexts(input: BuildCodeMapInput): {
  readonly symbols: CodeSymbol[];
  readonly links: CodeLink[];
  readonly sqlStatements: CodeSqlStatement[];
  readonly entities: CodeEntity[];
} {
  const mask = (text: string): string => input.masker.mask(text).text;
  return {
    symbols: input.packs.symbols.map((symbol) => ({
      path: symbol.path,
      kind: symbol.kind,
      name: mask(symbol.name),
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      ...(symbol.container === undefined ? {} : { container: mask(symbol.container) }),
    })),
    links: input.packs.links.map((link) => ({
      from: link.from,
      to: link.to,
      kind: link.kind,
      ...(link.symbol === undefined ? {} : { symbol: mask(link.symbol) }),
    })),
    // Masking can lengthen a text (a short secret becomes a longer marker), so the cut comes last.
    sqlStatements: input.scan.sqlStatements.map((statement) => ({
      path: statement.path,
      line: statement.line,
      verb: statement.verb,
      text: mask(statement.text).slice(0, maxStatementCharacters),
    })),
    entities: input.packs.entities.map((entity) => ({
      name: mask(entity.name),
      path: entity.path,
      startLine: entity.startLine,
      source: mask(entity.source),
    })),
  };
}

/** Builds the code map; a problem means the inputs broke a rule of the code map (a bug upstream). */
export function buildCodeMap(input: BuildCodeMapInput): Result<CodeMap, BuildCodeMapProblem> {
  const files = fileEntries(input);
  if (!files.ok) return files;
  const areas = groupIntoAreas({
    files: files.value,
    links: input.packs.links,
    areaTokenBudget: input.areaTokenBudget,
    configured: input.configuredAreas.map(configuredAreaOf),
  });
  if (!areas.ok) return err(areas.error);
  return createCodeMap({
    source: input.source,
    files: files.value,
    areas: areas.value,
    ...maskedTexts(input),
    languagePacks: input.packs.languagePacks,
  });
}
