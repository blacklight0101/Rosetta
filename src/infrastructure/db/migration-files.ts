import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

/** A numbered migration file `NNNN_snake_name.sql` (data-model.md section 7). */
export interface MigrationFile {
  readonly version: number;
  /** The file name, recorded in `schema_version.name`. */
  readonly name: string;
  readonly sql: string;
  /** SHA-256 of the file contents, lower-case hex. */
  readonly checksum: string;
}

const FILE_NAME = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

// RF-1302
export function toMigrationFile(fileName: string, sql: string): MigrationFile {
  const version = Number(FILE_NAME.exec(fileName)?.[1] ?? 0);
  if (version === 0) {
    throw new RosettaError(
      ERROR_CODES.migrationFileInvalid,
      `Migration file ${fileName} is not named NNNN_snake_name.sql with NNNN from 0001.`,
    );
  }
  const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
  return { version, name: fileName, sql, checksum };
}

/** The migrations in version order; two files with one version are refused. */
// RF-1302
export function inVersionOrder(files: readonly MigrationFile[]): MigrationFile[] {
  const sorted = [...files].sort((left, right) => left.version - right.version);
  sorted.forEach((file, index) => {
    const previous = sorted[index - 1];
    if (previous?.version === file.version) {
      throw new RosettaError(
        ERROR_CODES.migrationFileInvalid,
        `Migration files ${previous.name} and ${file.name} have the same number.`,
      );
    }
  });
  return sorted;
}

/** Reads every `.sql` file of `folder` as a migration, in version order; other files are ignored. */
// RF-1302
export async function readMigrationFiles(folder: string): Promise<MigrationFile[]> {
  const names = (await readdir(folder)).filter((name) => name.endsWith('.sql'));
  const files = await Promise.all(
    names.map(async (name) => toMigrationFile(name, await readFile(join(folder, name), 'utf8'))),
  );
  return inVersionOrder(files);
}
