import type { RepositoryReader } from '../../../application/ports/repository-reader.js';
import { isDefaultIgnored } from './default-ignores.js';
import { inspectFile } from './inspect-file.js';
import type { ScanOptions, ScannedFile, SqlStatement, UniversalScan } from './scan-types.js';

// RF-100..RF-103, RF-124, ADR-004: the universal layer of the scan. It reads only through the
// RepositoryReader port (so ignore rules, the deny list and the subpath already apply), holds one
// file in memory at a time, and returns lists in a fixed order so two scans of one snapshot are
// identical (RF-106).

function byCodePoint(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function bySqlPosition(left: SqlStatement, right: SqlStatement): number {
  return byCodePoint(left.path, right.path) || left.line - right.line;
}

export async function scanRepository(
  reader: RepositoryReader,
  options: ScanOptions,
): Promise<UniversalScan> {
  const subpath = options.subpath ?? '';
  const files: ScannedFile[] = [];
  const sqlStatements: SqlStatement[] = [];
  const unreadable: string[] = [];
  for (const path of await reader.listFiles()) {
    if (isDefaultIgnored(path, subpath)) continue;
    const read = await reader.readBytes({ path, maxBytes: options.maxFileBytes });
    if (!read.ok) {
      unreadable.push(path);
      continue;
    }
    const inspected = inspectFile(path, read.value);
    files.push(inspected.file);
    sqlStatements.push(...inspected.sql);
  }
  return {
    files: files.sort((left, right) => byCodePoint(left.path, right.path)),
    sqlStatements: sqlStatements.sort(bySqlPosition),
    skippedPaths: {
      links: [...reader.skippedPaths.links].sort(byCodePoint),
      invalidNames: [...reader.skippedPaths.invalidNames].sort(byCodePoint),
    },
    unreadable: unreadable.sort(byCodePoint),
  };
}
