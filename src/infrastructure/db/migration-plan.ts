import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { inVersionOrder, type MigrationFile } from './migration-files.js';

/** A row of `schema_version`: what the database says was applied. */
export interface RecordedMigration {
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

/**
 * Refuses to serve a schema the migrate step has not brought up to date (DEC-140): a changed or
 * unknown migration as in `pendingMigrations`, and any pending one with RST-2405. `undefined`
 * means the server could not read `schema_version` (absent, or from before migration 0010).
 */
// RF-1302
export function requireCurrentSchema(
  recorded: readonly RecordedMigration[] | undefined,
  known: readonly MigrationFile[],
): void {
  const pending = pendingMigrations(recorded ?? [], known);
  const first = pending[0];
  if (first === undefined) return;
  throw new RosettaError(
    ERROR_CODES.migrationPending,
    `The database schema is older than this version of Rosetta: ${String(pending.length)} migration(s) are not applied, starting with ${first.name}. Run the migrate step first.`,
  );
}
