import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import type {
  LanguagePack,
  PackAnalysis,
  PackEntity,
  PackReference,
  PackRoute,
  PackSymbol,
} from '../../../application/ports/language-pack.js';
import type { Logger } from '../../../application/ports/logger.js';
import type { RepositoryReader } from '../../../application/ports/repository-reader.js';
import { ERROR_CODES, type ErrorCode } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { byCodeUnit } from '../../../domain/code-map/code-unit-order.js';
import type { MapLevel } from '../../../domain/code-map/map-level.js';
import { decodeText } from '../universal/binary-detect.js';
import type { ScannedFile } from '../universal/scan-types.js';
import type { LanguagePackRegistry } from './pack-registry.js';
import { ParseTimer, type ParseBudget } from './parse-budget.js';

// RF-110, RF-112, ADR-004: the second layer of the scan. For every file a pack claims, the pack adds
// symbols, links, routes and entities and the file gets map level `symbols`; a file no pack claims,
// a skipped file and a file the pack fails on stay `coarse`. A failing pack never stops the scan.
// Files are read one at a time through the RepositoryReader port. Once the scan-wide parse budget
// is spent (P1-75), the remaining files a pack claims stay `coarse` with an RST-1204 warning.

export interface PackScanInput {
  /** The files of the universal scan, sorted by path. */
  readonly files: readonly ScannedFile[];
  readonly reader: Pick<RepositoryReader, 'readBytes'>;
  readonly registry: LanguagePackRegistry;
  readonly logger: Logger;
  /** The `scan.maxFileBytes` the universal scan used. */
  readonly maxFileBytes: number;
  /** The total time the packs may spend on this scan; two minutes when absent. */
  readonly parseBudget?: ParseBudget;
}

interface FileLevel {
  readonly path: string;
  readonly mapLevel: MapLevel;
}

/** A file a pack was due to map and did not. The failure's text is never kept (RF-141). */
interface PackWarning {
  readonly path: string;
  readonly pack: string;
  readonly code: ErrorCode;
}

interface PackLink {
  readonly from: string;
  readonly to: string;
  readonly kind: PackReference['kind'];
  readonly symbol?: string;
}

export interface PackScan {
  /** One entry per scanned file, sorted by path. */
  readonly fileLevels: readonly FileLevel[];
  readonly symbols: readonly PackSymbol[];
  readonly links: readonly PackLink[];
  readonly routes: readonly PackRoute[];
  readonly entities: readonly PackEntity[];
  /** The packs that mapped at least one file, sorted by name. */
  readonly languagePacks: readonly { readonly name: string; readonly version: string }[];
  readonly warnings: readonly PackWarning[];
}

interface Collected {
  readonly symbols: PackSymbol[];
  readonly references: PackReference[];
  readonly routes: PackRoute[];
  readonly entities: PackEntity[];
}

function failureCode(error: unknown): ErrorCode {
  return error instanceof RosettaError ? error.code : 'RST-1200';
}

const bySymbol = (a: PackSymbol, b: PackSymbol): number =>
  byCodeUnit(a.path, b.path) || a.startLine - b.startLine || byCodeUnit(a.name, b.name);
const byLink = (a: PackLink, b: PackLink): number =>
  byCodeUnit(a.from, b.from) || byCodeUnit(a.to, b.to) || byCodeUnit(a.kind, b.kind);
const byRoute = (a: PackRoute, b: PackRoute): number =>
  byCodeUnit(a.path, b.path) || a.startLine - b.startLine || byCodeUnit(a.template, b.template);
const byEntity = (a: PackEntity, b: PackEntity): number =>
  byCodeUnit(a.path, b.path) || a.startLine - b.startLine || byCodeUnit(a.name, b.name);

/** Maps a reference target to a scanned path: exact, else the one path equal ignoring case. */
function pathResolver(files: readonly ScannedFile[]): (target: string) => string | undefined {
  const exact = new Set(files.map((file) => file.path));
  const folded = new Map<string, string | undefined>();
  for (const { path } of files) {
    const key = path.toLowerCase();
    folded.set(key, folded.has(key) ? undefined : path);
  }
  return (target) => (exact.has(target) ? target : folded.get(target.toLowerCase()));
}

function resolveLinks(
  references: readonly PackReference[],
  resolve: (target: string) => string | undefined,
): { readonly links: PackLink[]; readonly dropped: number } {
  const links: PackLink[] = [];
  for (const reference of references) {
    const to = resolve(reference.to);
    if (to === undefined) continue;
    links.push({ ...reference, to });
  }
  return { links: links.sort(byLink), dropped: references.length - links.length };
}

interface Mapped {
  readonly collected: Collected;
  readonly fileLevels: FileLevel[];
  readonly warnings: PackWarning[];
  /** Names of the packs that mapped at least one file. */
  readonly used: Set<string>;
  readonly timer: ParseTimer;
}

async function mapFile(input: PackScanInput, file: ScannedFile, mapped: Mapped): Promise<void> {
  const pack = file.skipped === undefined ? input.registry.packFor(file.path) : undefined;
  const outcome: Outcome =
    pack === undefined ? {} : await analyseOne({ input, file, pack, timer: mapped.timer });
  if (outcome.analysis !== undefined && pack !== undefined) {
    mapped.used.add(pack.name);
    collect(mapped.collected, outcome.analysis);
  }
  if (outcome.warning !== undefined) mapped.warnings.push(outcome.warning);
  mapped.fileLevels.push({
    path: file.path,
    mapLevel: outcome.analysis === undefined ? 'coarse' : 'symbols',
  });
}

export async function analyseWithPacks(input: PackScanInput): Promise<PackScan> {
  const { files, registry, logger } = input;
  const mapped: Mapped = {
    collected: { symbols: [], references: [], routes: [], entities: [] },
    fileLevels: [],
    warnings: [],
    used: new Set<string>(),
    timer: new ParseTimer(input.parseBudget),
  };
  for (const file of files) {
    await mapFile(input, file, mapped);
    await yieldToEventLoop();
  }
  const { collected, used } = mapped;
  const warnings = mapped.warnings.sort((a, b) => byCodeUnit(a.path, b.path));
  await logWarnings(logger, warnings, mapped.timer.totalMs);
  const { links, dropped } = resolveLinks(collected.references, pathResolver(files));
  if (dropped > 0) await logDropped(logger, dropped);
  return {
    fileLevels: mapped.fileLevels.sort((a, b) => byCodeUnit(a.path, b.path)),
    symbols: collected.symbols.sort(bySymbol),
    links,
    routes: collected.routes.sort(byRoute),
    entities: collected.entities.sort(byEntity),
    languagePacks: registry.packs
      .filter((pack) => used.has(pack.name))
      .map(({ name, version }) => ({ name, version })),
    warnings,
  };
}

function collect(into: Collected, analysis: PackAnalysis): void {
  into.symbols.push(...analysis.symbols);
  into.references.push(...analysis.references);
  into.routes.push(...analysis.routes);
  into.entities.push(...analysis.entities);
}

interface Outcome {
  readonly analysis?: PackAnalysis;
  readonly warning?: PackWarning;
}

interface PackCall {
  readonly input: PackScanInput;
  readonly file: ScannedFile;
  readonly pack: LanguagePack;
  readonly timer: ParseTimer;
}

async function analyseOne({ input, file, pack, timer }: PackCall): Promise<Outcome> {
  const warning = (code: ErrorCode): Outcome => ({
    warning: { path: file.path, pack: pack.name, code },
  });
  if (timer.exhausted()) return warning(ERROR_CODES.parseBudgetReached);
  const read = await input.reader.readBytes({ path: file.path, maxBytes: input.maxFileBytes });
  if (!read.ok) return warning(read.error.code);
  if (read.value.bytes === undefined) return warning('RST-1200');
  const packFile = {
    path: file.path,
    text: decodeText(read.value.bytes),
    shouldStop: timer.exhausted,
  };
  try {
    return { analysis: timer.measure(() => pack.analyse(packFile)) };
  } catch (error) {
    // A pack stopped by the budget usually throws its own "took too long"; the budget is the reason.
    return warning(timer.exhausted() ? ERROR_CODES.parseBudgetReached : failureCode(error));
  }
}

/** One warning per failed file, and one for all the files past the parse budget together. */
async function logWarnings(
  logger: Logger,
  warnings: readonly PackWarning[],
  budgetMs: number,
): Promise<void> {
  const overBudget = warnings.filter((warning) => warning.code === ERROR_CODES.parseBudgetReached);
  for (const warning of warnings) {
    if (warning.code !== ERROR_CODES.parseBudgetReached) await logWarning(logger, warning);
  }
  if (overBudget.length === 0) return;
  await logger.log({
    level: 'warn',
    logger: 'scan',
    code: ERROR_CODES.parseBudgetReached,
    message: 'The scan reached its parse budget; the remaining files a pack claims stay coarse.',
    data: { budgetMs, files: overBudget.length },
  });
}

async function logWarning(logger: Logger, warning: PackWarning): Promise<void> {
  await logger.log({
    level: 'warn',
    logger: 'scan',
    code: warning.code,
    message: `Language pack ${warning.pack} could not map ${warning.path}; the file stays coarse.`,
    data: { path: warning.path, pack: warning.pack },
  });
}

async function logDropped(logger: Logger, dropped: number): Promise<void> {
  await logger.log({
    level: 'warn',
    logger: 'scan',
    message: 'Links to files outside the scan were dropped.',
    data: { dropped },
  });
}
