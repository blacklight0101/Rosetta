import type {
  CodeEntity,
  CodeLink,
  CodeMap,
  CodeSqlStatement,
  CodeSymbol,
} from '../../domain/code-map/code-map.js';
import type { FileEntry } from '../../domain/code-map/file-entry.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-145, RF-201: the agent tools read only files the code map lists. A path the model writes in
// another letter case resolves to the code map's own spelling, so every excerpt the egress guard
// sees carries one spelling per file (its private-key carry is keyed by path, P1-28).

export type PathLookupProblem =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly string[] };

export interface FileDetails {
  readonly entry: FileEntry;
  readonly area: string | undefined;
  readonly symbols: readonly CodeSymbol[];
  readonly links: readonly CodeLink[];
  readonly sqlStatements: readonly CodeSqlStatement[];
  readonly entities: readonly CodeEntity[];
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    const group = groups.get(name);
    if (group === undefined) groups.set(name, [item]);
    else group.push(item);
  }
  return groups;
}

export class CodeMapIndex {
  private readonly codeMap: CodeMap;
  private readonly files: ReadonlyMap<string, FileEntry>;
  private readonly folded: ReadonlyMap<string, FileEntry[]>;
  private readonly areas: ReadonlyMap<string, string>;

  constructor(codeMap: CodeMap) {
    this.codeMap = codeMap;
    this.files = new Map(codeMap.files.map((file) => [file.path, file]));
    this.folded = groupBy(codeMap.files, (file) => file.path.toLowerCase());
    this.areas = new Map(
      codeMap.areas.flatMap((area) => area.files.map((path) => [path, area.name] as const)),
    );
  }

  /** The listed file of a path: exact first, else the one file that differs only in case. */
  resolve(path: string): Result<FileEntry, PathLookupProblem> {
    const exact = this.files.get(path);
    if (exact !== undefined) return ok(exact);
    const matches = this.folded.get(path.toLowerCase()) ?? [];
    const [only] = matches;
    if (only !== undefined && matches.length === 1) return ok(only);
    if (matches.length > 1) {
      return err({ kind: 'ambiguous', candidates: matches.map((file) => file.path) });
    }
    return err({ kind: 'not-found' });
  }

  /** The files the scan read: listed and not skipped (RF-100), sorted by path. */
  readablePaths(): readonly string[] {
    return this.codeMap.files.filter((file) => file.skipped === undefined).map((file) => file.path);
  }

  /** Symbols and entities whose name is `name`, ignoring case. */
  named(name: string): { symbols: readonly CodeSymbol[]; entities: readonly CodeEntity[] } {
    const wanted = name.toLowerCase();
    return {
      symbols: this.codeMap.symbols.filter((symbol) => symbol.name.toLowerCase() === wanted),
      entities: this.codeMap.entities.filter((entity) => entity.name.toLowerCase() === wanted),
    };
  }

  details(entry: FileEntry): FileDetails {
    const { path } = entry;
    return {
      entry,
      area: this.areas.get(path),
      symbols: this.codeMap.symbols.filter((symbol) => symbol.path === path),
      links: this.codeMap.links.filter((link) => link.from === path || link.to === path),
      sqlStatements: this.codeMap.sqlStatements.filter((statement) => statement.path === path),
      entities: this.codeMap.entities.filter((entity) => entity.path === path),
    };
  }
}
