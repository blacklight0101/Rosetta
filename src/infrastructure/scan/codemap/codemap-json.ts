import { z } from 'zod';
import { MAX_AREA_NAME_LENGTH, type AreaProblem } from '../../../domain/code-map/area.js';
import {
  createCodeMap,
  type CodeLink,
  type CodeMap,
  type CodeMapProblem,
  type CodeSymbol,
} from '../../../domain/code-map/code-map.js';
import {
  createFileEntry,
  type FileEntry,
  type FileEntryProblem,
} from '../../../domain/code-map/file-entry.js';
import { err, type Result } from '../../../domain/errors/result.js';

// RF-105, RF-106, data-model 3.4: `codemap.json`. The writer lists every key in a fixed order, so
// the same map always gives the same bytes; the reader parses with a strict schema (unknown keys
// are an error) and then re-checks the invariants of the domain. Every list has a cap.

const maxFiles = 200_000;
const maxAreas = 200_000;
const maxSymbols = 1_000_000;
const maxLinks = 500_000;
const maxStatements = 200_000;
const maxEntities = 200_000;
const maxPacks = 64;
const maxPath = 1024;
const maxName = 1024;

const path = z.string().min(1).max(maxPath);
const mapLevel = z.enum(['coarse', 'symbols']);

const fileSchema = z.strictObject({
  path,
  language: z.string().min(1).max(64),
  lines: z.number().int().min(0),
  estimatedTokens: z.number().int().min(0),
  sha256: z.string().length(64).optional(),
  artefactKinds: z
    .array(
      z.enum(['configuration', 'controller', 'database-script', 'entry-point', 'manifest', 'page']),
    )
    .max(6),
  mapLevel,
  skipped: z.enum(['binary', 'too-large']).optional(),
});

const areaSchema = z.strictObject({
  name: z.string().min(1).max(MAX_AREA_NAME_LENGTH),
  files: z.array(path).min(1).max(maxFiles),
  estimatedTokens: z.number().int().min(0),
  mapLevel,
  origin: z.enum(['config', 'folder', 'references']),
});

const symbolSchema = z.strictObject({
  path,
  kind: z.enum(['class', 'enum', 'function', 'interface', 'method', 'property', 'struct']),
  name: z.string().max(maxName),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  container: z
    .string()
    .max(maxName * 2)
    .optional(),
});

const linkSchema = z.strictObject({
  from: path,
  to: path,
  kind: z.enum(['code-behind', 'import']),
  symbol: z
    .string()
    .max(maxName * 2)
    .optional(),
});

const statementSchema = z.strictObject({
  path,
  line: z.number().int().min(1),
  verb: z.enum(['CREATE', 'DELETE', 'EXEC', 'INSERT', 'SELECT', 'UPDATE']),
  text: z.string().max(500),
});

const entitySchema = z.strictObject({
  name: z.string().max(maxName),
  path,
  startLine: z.number().int().min(1),
  source: z.string().max(maxName * 2),
});

const codeMapSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.strictObject({
    owner: z.string().min(1).max(100),
    repo: z.string().min(1).max(100),
    commitSha: z.string().regex(/^[0-9a-f]{40}$/u),
    subpath: z.string().max(maxPath),
  }),
  files: z.array(fileSchema).max(maxFiles),
  areas: z.array(areaSchema).max(maxAreas),
  symbols: z.array(symbolSchema).max(maxSymbols),
  links: z.array(linkSchema).max(maxLinks),
  sqlStatements: z.array(statementSchema).max(maxStatements),
  entities: z.array(entitySchema).max(maxEntities),
  languagePacks: z
    .array(z.strictObject({ name: z.string().min(1).max(64), version: z.string().min(1).max(64) }))
    .max(maxPacks),
});

export type CodeMapParseProblem =
  'invalid-json' | 'invalid-schema' | AreaProblem | CodeMapProblem | FileEntryProblem;

function fileJson(file: FileEntry): Record<string, unknown> {
  return {
    path: file.path,
    language: file.language,
    lines: file.lines,
    estimatedTokens: file.estimatedTokens,
    ...(file.sha256 === undefined ? {} : { sha256: file.sha256 }),
    artefactKinds: file.artefactKinds,
    mapLevel: file.mapLevel,
    ...(file.skipped === undefined ? {} : { skipped: file.skipped }),
  };
}

function symbolJson(symbol: CodeSymbol): Record<string, unknown> {
  return {
    path: symbol.path,
    kind: symbol.kind,
    name: symbol.name,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    ...(symbol.container === undefined ? {} : { container: symbol.container }),
  };
}

function linkJson(link: CodeLink): Record<string, unknown> {
  return {
    from: link.from,
    to: link.to,
    kind: link.kind,
    ...(link.symbol === undefined ? {} : { symbol: link.symbol }),
  };
}

/** The text of `codemap.json`: two-space indent, fixed key order, one final line break. */
export function serialiseCodeMap(map: CodeMap): string {
  const json = {
    schemaVersion: map.schemaVersion,
    source: {
      owner: map.source.owner,
      repo: map.source.repo,
      commitSha: map.source.commitSha,
      subpath: map.source.subpath,
    },
    files: map.files.map(fileJson),
    areas: map.areas.map((area) => ({
      name: area.name,
      files: area.files,
      estimatedTokens: area.estimatedTokens,
      mapLevel: area.mapLevel,
      origin: area.origin,
    })),
    symbols: map.symbols.map(symbolJson),
    links: map.links.map(linkJson),
    sqlStatements: map.sqlStatements.map((statement) => ({
      path: statement.path,
      line: statement.line,
      verb: statement.verb,
      text: statement.text,
    })),
    entities: map.entities.map((entity) => ({
      name: entity.name,
      path: entity.path,
      startLine: entity.startLine,
      source: entity.source,
    })),
    languagePacks: map.languagePacks.map((pack) => ({ name: pack.name, version: pack.version })),
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}

function parseJson(text: string): Result<unknown, 'invalid-json'> {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return err('invalid-json');
  }
}

type Parsed = z.infer<typeof codeMapSchema>;

function fileOf(row: Parsed['files'][number]): FileEntry {
  return {
    path: row.path,
    language: row.language,
    lines: row.lines,
    estimatedTokens: row.estimatedTokens,
    ...(row.sha256 === undefined ? {} : { sha256: row.sha256 }),
    artefactKinds: row.artefactKinds,
    mapLevel: row.mapLevel,
    ...(row.skipped === undefined ? {} : { skipped: row.skipped }),
  };
}

function validFiles(rows: Parsed['files']): Result<FileEntry[], FileEntryProblem> {
  const files: FileEntry[] = [];
  for (const row of rows) {
    const made = createFileEntry(fileOf(row));
    if (!made.ok) return made;
    files.push(made.value);
  }
  return { ok: true, value: files };
}

/** Reads `codemap.json`: strict schema first, then the invariants of the code map. */
export function parseCodeMap(text: string): Result<CodeMap, CodeMapParseProblem> {
  const json = parseJson(text);
  if (!json.ok) return json;
  const parsed = codeMapSchema.safeParse(json.value);
  if (!parsed.success) return err('invalid-schema');
  const row = parsed.data;
  const files = validFiles(row.files);
  if (!files.ok) return files;
  return createCodeMap({
    source: row.source,
    files: files.value,
    areas: row.areas,
    symbols: row.symbols.map((symbol) => ({
      path: symbol.path,
      kind: symbol.kind,
      name: symbol.name,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      ...(symbol.container === undefined ? {} : { container: symbol.container }),
    })),
    links: row.links.map((link) => ({
      from: link.from,
      to: link.to,
      kind: link.kind,
      ...(link.symbol === undefined ? {} : { symbol: link.symbol }),
    })),
    sqlStatements: row.sqlStatements,
    entities: row.entities,
    languagePacks: row.languagePacks,
  });
}
