import type { RepositoryReader } from '../../../application/ports/repository-reader.js';
import { byCodeUnit } from '../../../domain/code-map/code-unit-order.js';
import { defaultIgnoreOf } from './default-ignores.js';
import { inspectFile } from './inspect-file.js';
import type {
  IgnoredEntry,
  ScanOptions,
  ScannedFile,
  SqlStatement,
  UniversalScan,
} from './scan-types.js';

// RF-100..RF-103, RF-124, ADR-004: the universal layer of the scan. It reads only through the
// RepositoryReader port (so ignore rules, the deny list and the subpath already apply), holds one
// file in memory at a time, and returns lists in a fixed order so two scans of one snapshot are
// identical (RF-106).

function bySqlPosition(left: SqlStatement, right: SqlStatement): number {
  return byCodeUnit(left.path, right.path) || left.line - right.line;
}

export async function scanRepository(
  reader: RepositoryReader,
  options: ScanOptions,
): Promise<UniversalScan> {
  const files: ScannedFile[] = [];
  const sqlStatements: SqlStatement[] = [];
  const unreadable: string[] = [];
  const ignored = new Map<string, { rule: string; files: number }>();
  for (const path of await reader.listFiles()) {
    const left = defaultIgnoreOf(path, reader.subpath);
    if (left !== undefined) {
      const seen = ignored.get(left.path);
      ignored.set(left.path, { rule: left.rule, files: (seen?.files ?? 0) + 1 });
      continue;
    }
    const read = await reader.readBytes({ path, maxBytes: options.maxFileBytes });
    if (!read.ok) {
      unreadable.push(path);
      continue;
    }
    const inspected = inspectFile(path, read.value, options.masker);
    files.push(inspected.file);
    sqlStatements.push(...inspected.sql);
  }
  return {
    files: files.sort((left, right) => byCodeUnit(left.path, right.path)),
    sqlStatements: sqlStatements.sort(bySqlPosition),
    skippedPaths: {
      links: [...reader.skippedPaths.links].sort(byCodeUnit),
      invalidNames: [...reader.skippedPaths.invalidNames].sort(byCodeUnit),
    },
    unreadable: unreadable.sort(byCodeUnit),
    ignored: [...ignored]
      .map(([path, entry]): IgnoredEntry => ({ path, rule: entry.rule, files: entry.files }))
      .sort((left, right) => byCodeUnit(left.path, right.path)),
  };
}
