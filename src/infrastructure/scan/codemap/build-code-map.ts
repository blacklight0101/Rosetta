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
import { maskCodeMap } from './mask-code-map.js';
import type { PackScan } from '../packs/pack-scan.js';
import type { ScannedFile, UniversalScan } from '../universal/scan-types.js';

// RF-104, RF-105, RF-141: joins the universal scan and the language-pack analysis into the code
// map on the real paths, then masks every repository text with the SecretMasker (mask-code-map.ts)
// before returning it, so the JSON writer and the summary only ever see masked text.

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

function rawTexts(input: BuildCodeMapInput): {
  readonly symbols: CodeSymbol[];
  readonly links: CodeLink[];
  readonly sqlStatements: CodeSqlStatement[];
  readonly entities: CodeEntity[];
} {
  return {
    symbols: input.packs.symbols.map((symbol) => ({ ...symbol })),
    links: input.packs.links.map((link) => ({ ...link })),
    sqlStatements: input.scan.sqlStatements.map((statement) => ({ ...statement })),
    entities: input.packs.entities.map((entity) => ({ ...entity })),
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
  const raw = createCodeMap({
    source: input.source,
    files: files.value,
    areas: areas.value,
    ...rawTexts(input),
    languagePacks: input.packs.languagePacks,
  });
  return raw.ok ? maskCodeMap(raw.value, input.masker) : raw;
}
