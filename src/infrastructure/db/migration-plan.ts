import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { inVersionOrder, type MigrationFile } from './migration-files.js';

/** A row of `schema_version`: what the database says was applied. */
interface RecordedMigration {
  readonly version: number;
  readonly checksum: string;
}

/**
 * The migrations still to apply, in version order. Every recorded migration must still exist
 * with the same checksum; otherwise nothing is applied (RST-2401, RST-2402).
 */
// RF-1302
export function pendingMigrations(
  recorded: readonly RecordedMigration[],
  known: readonly MigrationFile[],
): MigrationFile[] {
  const ordered = inVersionOrder(known);
  const byVersion = new Map(ordered.map((file) => [file.version, file]));
  for (const row of recorded) {
    const file = byVersion.get(row.version);
    if (file === undefined) {
      throw new RosettaError(
        ERROR_CODES.migrationUnknown,
        `The database has migration ${String(row.version)}, which this version of Rosetta does not know.`,
      );
    }
    if (file.checksum !== row.checksum) {
      throw new RosettaError(
        ERROR_CODES.migrationChanged,
        `Migration ${file.name} was changed after it was applied.`,
      );
    }
  }
  const applied = new Set(recorded.map((row) => row.version));
  return ordered.filter((file) => !applied.has(file.version));
}
